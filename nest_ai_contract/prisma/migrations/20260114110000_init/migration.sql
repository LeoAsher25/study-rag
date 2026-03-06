-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Contracts
CREATE TABLE IF NOT EXISTS "Contract" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contract files
CREATE TYPE "ContractFileStatus" AS ENUM ('UPLOADED','EXTRACTED','EMBEDDED','READY','FAILED');
CREATE TABLE IF NOT EXISTS "ContractFile" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE CASCADE,
  "versionNumber" INT NOT NULL DEFAULT 1,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "status" "ContractFileStatus" NOT NULL DEFAULT 'UPLOADED',
  "extractedText" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ContractFile_contractId_idx" ON "ContractFile"("contractId");

-- Chunks
CREATE TABLE IF NOT EXISTS "Chunk" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "contractFileId" TEXT NOT NULL REFERENCES "ContractFile"("id") ON DELETE CASCADE,
  "chunkIndex" INT NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "embedding" vector(1536),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Chunk_contractFileId_chunkIndex_key" UNIQUE ("contractFileId", "chunkIndex")
);
CREATE INDEX IF NOT EXISTS "Chunk_contractFileId_idx" ON "Chunk"("contractFileId");
CREATE INDEX IF NOT EXISTS "Chunk_contentHash_idx" ON "Chunk"("contentHash");

-- Chat session/messages
CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ChatSession_contractId_idx" ON "ChatSession"("contractId");

CREATE TYPE "ChatRole" AS ENUM ('user','assistant','system');
CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionId" TEXT NOT NULL REFERENCES "ChatSession"("id") ON DELETE CASCADE,
  "role" "ChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "citations" JSONB
);
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- Keep updatedAt fresh
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_contract_updated_at ON "Contract";
CREATE TRIGGER tr_contract_updated_at BEFORE UPDATE ON "Contract"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tr_contract_file_updated_at ON "ContractFile";
CREATE TRIGGER tr_contract_file_updated_at BEFORE UPDATE ON "ContractFile"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
