# Nest AI Contract (MVP)

A clean rewrite of the Java **AI Contract** backend using:

- **NestJS (TypeScript)**
- **Postgres + pgvector** (local Docker)
- **AWS Bedrock** for **Chat + Embeddings** (cost-optimized)
- **PDF text extraction** (no OCR) for MVP

This project is intentionally **provider-ready**: AI calls are isolated in `AwsBedrockService` so you can swap providers later.

## Features in this MVP

- Create / list contracts
- Upload a PDF contract file
- Extract text from PDF (works for text-based PDFs; scanned PDFs will fail without OCR)
- Chunk + embed text using AWS Bedrock (Amazon Titan Embeddings)
- Store embeddings in `pgvector`
- RAG chat endpoint with citations (Claude 3 Haiku or other Bedrock models)

## Quick start (local)

### 1) Start Postgres (pgvector)

```bash
docker compose up -d
```

### 2) Install deps

```bash
npm install
```

### 3) Configure env

```bash
cp .env.example .env
# edit .env
```

### 4) Run migrations

```bash
npx prisma migrate dev
```

### 5) Start API

```bash
npm run start:dev
```

API base URL: `http://localhost:4001/api`

## API

### Create contract

```bash
curl -X POST http://localhost:4001/api/contracts \
  -H 'Content-Type: application/json' \
  -d '{"title":"My Contract"}'
```

### Upload PDF + ingest

```bash
curl -X POST 'http://localhost:4001/api/contracts/<contractId>/files/upload' \
  -F 'file=@/path/to/contract.pdf'
```

If the PDF is scanned (image-only), you'll get a `FAILED` response. OCR is not enabled in this MVP.

### Create chat session

```bash
curl -X POST http://localhost:4001/api/chat/sessions \
  -H 'Content-Type: application/json' \
  -d '{"contractId":"<contractId>"}'
```

### Send a message (RAG)

```bash
curl -X POST http://localhost:4001/api/chat/messages \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"<sessionId>","message":"Summarize the termination clause"}'
```

## AWS Bedrock Setup

1. **Enable Bedrock models** in AWS Console:
   - Go to AWS Bedrock → Model access
   - Request access to:
     - `amazon.titan-embed-text-v1` (for embeddings)
     - `anthropic.claude-3-haiku-20240307-v1:0` (for chat, or choose another model)

2. **Configure AWS credentials** in `.env`:
   ```bash
   AWS_REGION=ap-southeast-1
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   ```

3. **Cost optimization**:
   - Embeddings: Amazon Titan (~$0.02 per 1K tokens)
   - Chat: Claude 3 Haiku (~$0.25/$1.25 per 1M tokens) - cost-effective option
   - Chat: Claude 3 Haiku (~$0.25/$1.25 per 1M tokens) - cost-effective option
   - See `.env.example` for other model options

## Notes / Tradeoffs

- Retrieval uses pgvector Euclidean distance (`<->`). For cosine similarity, you can switch to pgvector cosine operators.
- Embeddings dimension: Amazon Titan returns 1536 dimensions (matches migration).
- For production: add background jobs (queue), rate limits, caching, and persistence for file storage.
