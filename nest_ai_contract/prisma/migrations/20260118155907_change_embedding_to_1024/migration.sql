-- Change embedding dimension from 1536 (Titan) to 1024 (Cohere Embed v3)
-- WARNING: This will drop all existing embeddings. You need to re-embed all documents after this migration.

-- Drop the vector index if it exists
DROP INDEX IF EXISTS "Chunk_embedding_ivfflat_idx";

-- Drop the embedding column (this will delete all existing embeddings)
ALTER TABLE "Chunk" DROP COLUMN IF EXISTS "embedding";

-- Recreate the embedding column with 1024 dimensions
ALTER TABLE "Chunk" ADD COLUMN "embedding" vector(1024);

-- Reset status of all contract files that were READY back to EXTRACTED
-- This indicates they need to be re-embedded with the new model
UPDATE "ContractFile" SET "status" = 'EXTRACTED' WHERE "status" = 'READY';

-- Recreate the vector index for similarity search
CREATE INDEX IF NOT EXISTS "Chunk_embedding_ivfflat_idx" ON "Chunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
