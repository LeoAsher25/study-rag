-- DropIndex
DROP INDEX "Chunk_embedding_ivfflat_idx";

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
