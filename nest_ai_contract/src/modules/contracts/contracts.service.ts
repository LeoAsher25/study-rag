import * as fs from 'fs';
import * as path from 'path';
const pdfParse = require('pdf-parse');
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainVectorstoreService } from '../ai/langchain-vectorstore.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UploadContractFileDto } from './dto/upload-contract-file.dto';
import { Document } from '@langchain/core/documents';
import { v4 as uuidv4 } from 'uuid';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'data', 'uploads');

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vectorstore: LangChainVectorstoreService,
  ) {}

  async createContract(dto: CreateContractDto) {
    return this.prisma.contract.create({ data: { title: dto.title } });
  }

  async listContracts() {
    return this.prisma.contract.findMany({ orderBy: { createdAt: 'desc' } });
  }

  private getFileUrl(contractId: string, fileId: string): string {
    const baseUrl = this.config.get<string>('API_BASE_URL') || 'http://localhost:4001';
    return `${baseUrl}/api/v1/contracts/${contractId}/files/${fileId}`;
  }

  async getContract(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { files: { orderBy: { createdAt: 'desc' } } },
    });

    if (!contract) {
      return null;
    }

    return {
      ...contract,
      files: contract.files.map((file) => ({
        ...file,
        url: this.getFileUrl(contractId, file.id),
      })),
    };
  }

  async getContractFilePath(contractId: string, fileId: string): Promise<string | null> {
    const contractFile = await this.prisma.contractFile.findFirst({
      where: {
        id: fileId,
        contractId: contractId,
      },
    });

    if (!contractFile || !contractFile.storagePath || contractFile.storagePath === 'PENDING') {
      return null;
    }

    const absolutePath = path.isAbsolute(contractFile.storagePath)
      ? contractFile.storagePath
      : path.resolve(contractFile.storagePath);

    if (!fs.existsSync(absolutePath)) {
      this.logger.warn(`File not found at path: ${absolutePath}`);
      return null;
    }

    return absolutePath;
  }

  async uploadPdfAndIngest(contractId: string, file: Express.Multer.File, dto: UploadContractFileDto) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    const sanitizedOriginalName = path.basename(file.originalname || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');

    const contractFile = await this.prisma.contractFile.create({
      data: {
        contractId,
        versionNumber: dto.versionNumber ?? 1,
        originalName: sanitizedOriginalName,
        mimeType: file.mimetype,
        storagePath: 'PENDING',
        status: 'UPLOADED',
      },
    });

    await this.persistContractFile(contractId, contractFile.id, file.buffer);

    const extractedText = await this.extractTextFromPdfBuffer(file.buffer); 

    await this.prisma.contractFile.update({
      where: { id: contractFile.id },
      data: {
        extractedText,
        status: extractedText ? 'EXTRACTED' : 'FAILED',
      },
    });

    if (!extractedText) {
      return {
        contractFileId: contractFile.id,
        status: 'FAILED',
        message:
          'No extractable text found. This PDF may be scanned (image-only). OCR is not enabled in this MVP.',
      };
    }

    const chunkSize = this.config.get<number>('CHUNK_MAX_CHARS') ?? 3500;
    const chunkOverlap = this.config.get<number>('CHUNK_OVERLAP_CHARS') ?? 350;

    this.logger.log('Extracted text: \n' + extractedText);

    const normalizedForChunking = this.normalizeTextForChunking(extractedText);

    this.logger.log('Normalized for chunking: \n' + normalizedForChunking);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });
    
    const splits = await splitter.splitText(normalizedForChunking);

    // const splits = this.splitTextWithOverlap(normalizedForChunking, chunkSize, chunkOverlap);
    this.logger.log('Splits: \n' + splits.join('\n-------------------------------\n'));
    const documents: Document[] = splits.map((content, i) => ({
      pageContent: content,
      metadata: {
        contractFileId: contractFile.id,
        chunkIndex: i,
        chunkId: uuidv4(),
      },
    }));

    await this.storeChunks(contractFile.id, documents);

    return {
      contractFileId: contractFile.id,
      status: 'READY',
      chunks: documents.length,
    };
  }

  /**
   * Persists the contract file binary. Override or replace this to switch storage (e.g. S3, cloud).
   */
  private async persistContractFile(
    contractId: string,
    contractFileId: string,
    buffer: Buffer,
  ): Promise<void> {
    const dir = path.join(UPLOAD_DIR, contractId);
    fs.mkdirSync(dir, { recursive: true });
    const storagePath = path.join(dir, `${contractFileId}.pdf`);
    fs.writeFileSync(storagePath, buffer);
    await this.prisma.contractFile.update({
      where: { id: contractFileId },
      data: { storagePath },
    });
  }

  /**
   * Stores chunk documents in the vector store and marks the contract file as READY.
   * Replace this implementation (or inject a store service) to change the vector store backend.
   */
  private async storeChunks(contractFileId: string, documents: Document[]): Promise<void> {
    const store = await this.vectorstore.getStore();
    await store.addDocuments(documents);
    await this.prisma.contractFile.update({
      where: { id: contractFileId },
      data: { status: 'READY' },
    });
  }

  /**
   * Normalizes PDF-extracted text for chunking: merges mid-word line breaks
   * (e.g. "mười\nlăm" → "mười lăm") so chunks don't split in the middle of phrases.
   */
  private normalizeTextForChunking(text: string): string {
    return (
      text
        // Merge single newlines between word chars (mid-word breaks from PDF layout)
        .replace(/([^\s.!?])\s*\n\s*([^\s.!?])/g, '$1 $2')
        // Collapse multiple spaces
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  /**
   * Splits text with guaranteed character-based overlap.
   * Each chunk overlaps with the next by `overlap` chars (last N chars of chunk N = first N chars of chunk N+1).
   * Tries to break at sentence boundaries when near chunk end.
   */
  private splitTextWithOverlap(text: string, chunkSize: number, overlap: number): string[] {
    if (overlap >= chunkSize) overlap = Math.floor(chunkSize / 4);
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Prefer breaking at sentence boundary when near chunk end (within last 20% of chunk)
      if (end < text.length && chunk.length > overlap * 2) {
        const searchStart = Math.max(0, chunk.length - Math.floor(chunkSize * 0.2));
        const sentenceEnd = chunk.slice(searchStart).search(/[.!?]\s+/);
        if (sentenceEnd !== -1) {
          const cutIdx = searchStart + sentenceEnd + 1;
          chunk = chunk.slice(0, cutIdx).trim();
          if (chunk.length > 0) {
            chunks.push(chunk);
            start += Math.max(cutIdx - overlap, 1);
            continue;
          }
        }
      }

      chunks.push(chunk.trim());
      if (end >= text.length) break;
      start = end - overlap;
    }

    return chunks.filter((c) => c.length > 0);
  }

  private async extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
    try {
      if (!buffer || buffer.length === 0) {
        this.logger.error('PDF buffer is empty or undefined');
        return '';
      }

      this.logger.debug(`Parsing PDF buffer: ${buffer.length} bytes`);
      const parsed = await pdfParse(buffer);

      this.logger.debug(`PDF parsed successfully. Pages: ${parsed.numpages}, Text length: ${parsed.text?.length || 0}`);

      const text = (parsed.text ?? '').trim();

      if (!text) {
        this.logger.warn('PDF parsed but extracted text is empty');
        return '';
      }

      const normalized = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

      this.logger.debug(`Normalized text length: ${normalized.length} characters`);
      return normalized;
    } catch (e) {
      this.logger.error(
        `Error extracting text from PDF: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e.stack : undefined,
      );
      return '';
    }
  }
}
