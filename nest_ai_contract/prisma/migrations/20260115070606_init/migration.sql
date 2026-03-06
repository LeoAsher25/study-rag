/*
  Warnings:

  - The primary key for the `ChatMessage` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ChatSession` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Chunk` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Contract` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ContractFile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `status` column on the `ContractFile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `role` on the `ChatMessage` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_contractId_fkey";

-- DropForeignKey
ALTER TABLE "Chunk" DROP CONSTRAINT "Chunk_contractFileId_fkey";

-- DropForeignKey
ALTER TABLE "ContractFile" DROP CONSTRAINT "ContractFile_contractId_fkey";

-- DropIndex
DROP INDEX "Chunk_embedding_ivfflat_idx";

-- AlterTable
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "sessionId" SET DATA TYPE TEXT,
DROP COLUMN "role",
ADD COLUMN     "role" "ChatRole" NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "contractId" SET DATA TYPE TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Chunk" DROP CONSTRAINT "Chunk_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "contractFileId" SET DATA TYPE TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Contract" DROP CONSTRAINT "Contract_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "Contract_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ContractFile" DROP CONSTRAINT "ContractFile_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "contractId" SET DATA TYPE TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ContractFileStatus" NOT NULL DEFAULT 'UPLOADED',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "ContractFile_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "ContractFile" ADD CONSTRAINT "ContractFile_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_contractFileId_fkey" FOREIGN KEY ("contractFileId") REFERENCES "ContractFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
