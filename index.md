

## 1. “Disk” trong sơ đồ là gì?

**Disk** trong sequence diagram là **ổ đĩa (filesystem)** – nơi file PDF được lưu và đọc lại.

- **API**: Sau khi nhận upload, API ghi file xuống đĩa qua `persistContractFile` (ví dụ `UPLOAD_DIR/<contractId>/<contractFileId>.pdf`). Đó là bước “API → Disk” (ghi file).
- **Worker**: Khi xử lý job, worker cần nội dung PDF nhưng **không nhận buffer qua Redis** (buffer lớn, tốn RAM và băng thông). Thay vào đó worker đọc file từ **cùng đường dẫn** mà API đã ghi – đó là bước “Worker → Disk” (đọc file).

Tóm lại: **Disk = filesystem (thư mục upload)**. API ghi PDF xuống đĩa, worker đọc PDF từ đĩa; Redis chỉ chứa job nhỏ `{ contractId, contractFileId }`, không chứa nội dung file.

---

## 2. BullMQ và RabbitMQ khác nhau thế nào?

| Khía cạnh | BullMQ | RabbitMQ |
|-----------|--------|----------|
| **Bản chất** | Thư viện queue chạy trên **Redis** (queue nằm trong Redis). | **Message broker** riêng (server + protocol AMQP). Chạy như một service độc lập. |
| **Broker / storage** | Dùng **Redis** làm broker: queue, job state, delay đều lưu trong Redis. | Broker **RabbitMQ server**: queue, exchange, binding lưu trong broker (có thể persist xuống đĩa). |
| **Giao thức** | Giao tiếp với Redis (Redis protocol). Client = thư viện Node (BullMQ) nói chuyện với Redis. | **AMQP** (Advanced Message Queuing Protocol). Client (amqplib, amqp-connection-manager…) kết nối tới RabbitMQ server qua AMQP. |
| **Ngôn ngữ / runtime** | Thiết kế cho **Node.js** (JavaScript/TypeScript). Producer/Consumer đều viết bằng Node. | **Đa ngôn ngữ**: có client cho nhiều ngôn ngữ (Node, Python, Go, Java…). Producer bằng Python, consumer bằng Node đều được. |
| **Mô hình** | Queue + Job (payload + options: delay, retry, priority…). Một queue một loại job, phân biệt bằng job name. | **Exchange → Queue**: routing linh hoạt (direct, topic, fanout). Nhiều queue, nhiều consumer pattern, dead-letter, v.v. |
| **Retry / delay** | Có sẵn: `attempts`, `backoff`, `delay`, `repeat` (cron). | Tự implement (dead-letter + TTL, hoặc plugin delay). |
| **UI / monitoring** | Bull Board (web UI cho queue/job). | RabbitMQ Management UI (có sẵn), hoặc tools bên ngoài. |
| **Vận hành** | Chỉ cần **Redis** (đã có sẵn trong nhiều stack). | Cần **cài và chạy RabbitMQ server** (thêm một service trong infra). |
| **Phù hợp** | Ứng dụng **toàn Node**: job queue trong một stack (Nest, Express…), retry/delay đơn giản. | Hệ thống **nhiều service / đa ngôn ngữ**, cần routing phức tạp, chuẩn enterprise (AMQP). |

**Tóm tắt ngắn**:  
**BullMQ** = queue nằm trên Redis, dùng từ Node, đơn giản cho job queue (retry, delay sẵn).  
**RabbitMQ** = message broker riêng, giao thức AMQP, đa ngôn ngữ, mô hình exchange/queue linh hoạt hơn, phù hợp khi cần nhiều service trao đổi message hoặc nhiều pattern messaging.

