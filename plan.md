### Mục tiêu

Triển khai full system (BE, FE, DB, background workers, queue,…) lên AWS EC2, sau ALB, chạy trong ASG, dễ test, bảo mật tốt, và tối ưu chi phí.

Dưới đây là **outline chuẩn bị** (high-level) trước khi bắt tay vào cấu hình chi tiết.

---

### 1. Rà soát kiến trúc & yêu cầu

- **Xác định các thành phần**  
  - **FE**: Next.js/React build static + SSR? deploy trên EC2 hay dùng S3+CloudFront?  
  - **BE**: NestJS (service chính), background worker (ingest, queue consumer,…).  
  - **DB**: Postgres/MySQL? Dùng **RDS** hay tự host trên EC2? (best practice: RDS).  
  - **Cache / Queue**: Redis (ElastiCache) / SQS / Kafka?  
  - **Storage**: S3 cho file, logs, artifacts.
- **Phi functional requirements**  
  - SLA uptime, RTO/RPO (backup DB), expected traffic (QPS, concurrent users).  
  - Yêu cầu bảo mật (private subnet, no public DB, WAF,…).  
  - Mức budget → giới hạn loại instance, số AZ, scale max.

---

### 2. Thiết kế VPC & networking

- **VPC & Subnets**  
  - 1 VPC riêng.  
  - **Public subnets**: cho ALB, NAT Gateway, bastion host (nếu cần SSH).  
  - **Private subnets**: cho EC2 app (BE/FE), RDS, Redis.  
  - Ít nhất **2 AZ** (multi-AZ) cho HA (public+private subnet mỗi AZ).
- **Internet access & routing**  
  - NAT Gateway cho outbound traffic từ private subnet (update packages, gọi API ngoài).  
  - Route tables rõ ràng: public subnet route tới Internet Gateway, private subnet route tới NAT.
- **Security groups / NACL**  
  - SG cho ALB: mở 80/443 từ internet.  
  - SG cho EC2 app: chỉ nhận traffic từ SG của ALB.  
  - SG cho DB: chỉ nhận từ SG của app.  
  - Hạn chế SSH: chỉ qua bastion host / SSM Session Manager (không mở 22 public).

---

### 3. Chiến lược build & packaging ứng dụng

- **Chuẩn hóa build**  
  - FE: build ra static + SSR bundle (nếu có) → artifact (zip, docker image).  
  - BE: build NestJS → artifact (zip, docker image).  
  - Worker: tách process riêng (service systemd hoặc ECS/EKS nếu về sau).  
- **Chọn cách deploy**  
  - **Không container**: AMI + user-data script (install Node, pull code, env, PM2).  
  - **Có container (khuyến nghị dài hạn)**: build Docker images, push ECR, EC2 chạy ECS agent hoặc docker-compose (tạm thời).  
- **Config & secrets**  
  - Dùng **SSM Parameter Store** hoặc **Secrets Manager** cho DB creds, API keys,…  
  - Không hard-code `.env` trong AMI; load từ SSM khi boot.

---

### 4. Thiết kế Auto Scaling Group & Launch Template

- **Launch Template**  
  - OS (Amazon Linux 2/AL2023), instance type (t3.small/t3.medium cho dev).  
  - User-data: script auto `docker-compose up` hoặc `yarn start:prod` sau khi lấy env từ SSM.  
  - Attach IAM Role (EC2 Instance Profile) cho phép:
    - Read SSM params / Secrets.
    - CloudWatch logs/metrics.
- **ASG cho App Tier**  
  - Min/Desired/Max instances (ví dụ: 1–2–4 cho dev/stage, 2–4–8 cho prod nhỏ).  
  - Multi-AZ (spread across at least 2 AZ).  
  - Health checks: dùng **ELB health check** (HTTP/HTTPS) thay vì chỉ EC2.  
  - Scaling policies:
    - Theo **CPU Utilization**, hoặc
    - Theo **ALB RequestCount per target**, hoặc custom metric (latency).

---

### 5. Thiết kế Application Load Balancer

- **ALB setup**  
  - ALB trong public subnets, target group là ASG EC2 (port 80/3000 tuỳ app).  
  - Health check path rõ ràng: `/health` hoặc `/api/health`.
- **Listener & rules**  
  - Listener **80 → redirect 443** (HTTPS only).  
  - Listener **443** với ACM SSL certificate (domain đã verify).  
  - Path-based routing nếu có nhiều service (e.g. `/api` → BE, `/` → FE).  
- **Testing**  
  - Kiểm tra health check, deregistration delay, stickiness (nếu cần).

---

### 6. Database & data layer

- **RDS**  
  - Chọn engine (Postgres/MySQL), instance nhỏ (t3.micro/t3.small) cho dev.  
  - Private subnet, no public access, SG chỉ cho phép app SG.  
  - Backup policy, auto minor version upgrades, multi-AZ (nếu cần HA).  
- **Migration & seed**  
  - Chuẩn quy trình migrate DB (Prisma/TypeORM scripts,…).  
  - Tách bước migrate trong CI/CD hoặc trong user-data chỉ chạy 1 lần (cẩn thận race khi scale).

---

### 7. CI/CD & release strategy

- **Pipeline**  
  - GitHub Actions / GitLab CI / AWS CodePipeline.  
  - Stages: **lint/test → build → package → push (S3/ECR) → deploy (CodeDeploy/ASG rolling)**.
- **Triển khai lên ASG**  
  - Dùng **CodeDeploy** với deployment group gắn vào ASG (EC2).  
  - Strategy: rolling/blue-green để tránh downtime.  
  - Health check integration với ALB để auto rollback nếu fail.
- **Environment tách biệt**  
  - dev / staging / prod: mỗi env có VPC/ASG/RDS riêng hoặc tách logical (tối thiểu ASG + DB riêng).

---

### 8. Logging, monitoring & observability

- **Metrics**  
  - CloudWatch metrics cho EC2, ALB, RDS, ASG.  
  - Alarm cho:
    - CPU cao, 5xx/4xx trên ALB, high latency.  
    - RDS CPU, free storage, connections.
- **Logs**  
  - App logs gửi về **CloudWatch Logs** (CloudWatch agent hoặc Docker log driver).  
  - ALB access logs bật (gửi S3).  
- **Tracing (nice to have)**  
  - X-Ray / OpenTelemetry nếu hệ thống phức tạp.

---

### 9. Bảo mật & IAM

- **IAM roles**  
  - EC2 role: chỉ quyền cần thiết (SSM read, logs write,…).  
  - CI/CD role: quyền deploy (CodeDeploy, ASG update) nhưng không full admin.  
- **Secrets**  
  - Tất cả credentials → Secrets Manager / Parameter Store (KMS-encrypted).  
- **Network security**  
  - Không mở SSH public, dùng **SSM Session Manager** hoặc bastion host chỉ cho IP dev.  
  - Option: ALB + WAF cho thêm layer protection (rate limit, common exploits).

---

### 10. Chiến lược tối ưu chi phí

- **Compute**  
  - Dev/stage: instance nhỏ (t3/t4g), min instance = 1, scale-out thấp.  
  - Prod: cân bằng min instance vs SLA; dùng **reserved instances** hoặc **savings plans** nếu load ổn định.  
  - Dùng **Spot** trong ASG (mixed instances) cho jobs không critical.
- **Network & infra**  
  - Cân nhắc số lượng NAT Gateway (theo VPC, AZ) – đây là chi phí ẩn lớn.  
  - Tắt/scale-down env không dùng (dev/night, ephemeral test env).
- **Storage**  
  - RDS storage phù hợp, bật automatic storage scaling nhưng limit size.  
  - S3: lifecycle rule để chuyển logs sang Glacier sau X ngày.

---

### 11. Kế hoạch test ALB, ASG, scaling

- **Test functional**  
  - Gửi traffic qua ALB (curl, Postman) → verify routing, SSL, health.  
- **Test scaling**  
  - Dùng `ab`, `k6`, `locust` để generate load:  
    - Quan sát ASG scale-out/in.  
    - Đảm bảo deploy script idempotent khi nhiều instance boot cùng lúc.  
- **Test failure**  
  - Manual stop 1 instance → check ALB health, ASG tự replace.  
  - Reboot RDS (planned failover) → xem app handling.

---

Nếu bạn muốn, ở bước tiếp theo tôi có thể giúp bạn **vẽ sơ đồ kiến trúc cụ thể cho hệ thống hiện tại của bạn (Nest backend, frontend, DB)** rồi chuyển thành **checklist chi tiết** (theo từng service trong AWS Console/Terraform/CloudFormation).