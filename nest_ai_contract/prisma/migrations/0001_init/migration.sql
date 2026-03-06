-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Contracts
CREATE TABLE IF NOT EXISTS "Contract" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "title" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ContractFile" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "contractId" uuid NOT NULL REFERENCES "Contract"("id") ON DELETE CASCADE,
  "versionNumber" int NOT NULL DEFAULT 1,
  "originalName" text NOT NULL,
  "mimeType" text NOT NULL,
  "storagePath" text NOT NULL,
  "status" text NOT NULL DEFAULT 'UPLOADED',
  "extractedText" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ContractFile_contractId_idx" ON "ContractFile"("contractId");

CREATE TABLE IF NOT EXISTS "Chunk" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "contractFileId" uuid NOT NULL REFERENCES "ContractFile"("id") ON DELETE CASCADE,
  "chunkIndex" int NOT NULL,
  "content" text NOT NULL,
  "contentHash" text NOT NULL,
  "embedding" vector(1536),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Chunk_contractFileId_chunkIndex_key" UNIQUE ("contractFileId", "chunkIndex")
);

CREATE INDEX IF NOT EXISTS "Chunk_contractFileId_idx" ON "Chunk"("contractFileId");
CREATE INDEX IF NOT EXISTS "Chunk_contentHash_idx" ON "Chunk"("contentHash");

-- Optional: vector index (good for similarity search)
CREATE INDEX IF NOT EXISTS "Chunk_embedding_ivfflat_idx" ON "Chunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "contractId" uuid NOT NULL REFERENCES "Contract"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ChatSession_contractId_idx" ON "ChatSession"("contractId");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "sessionId" uuid NOT NULL REFERENCES "ChatSession"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "citations" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- Trigger to update updatedAt
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_updated ON "Contract";
CREATE TRIGGER trg_contract_updated BEFORE UPDATE ON "Contract"
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_contractfile_updated ON "ContractFile";
CREATE TRIGGER trg_contractfile_updated BEFORE UPDATE ON "ContractFile"
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
