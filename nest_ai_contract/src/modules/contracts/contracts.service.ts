import * as fs from 'fs';
import * as path from 'path';
const pdfParse = require('pdf-parse');
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainVectorstoreService } from '../ai/langchain-vectorstore.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UploadContractFileDto } from './dto/upload-contract-file.dto';
import { Document } from '@langchain/core/documents';
import { v4 as uuidv4 } from 'uuid';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Prefix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vectorstore: LangChainVectorstoreService,
    @InjectQueue('ingest') private readonly ingestQueue: Queue,
  ) {
    this.s3Bucket = this.config.get<string>('AWS_S3_BUCKET') ?? '';
    this.s3Prefix = (this.config.get<string>('AWS_S3_PREFIX') ?? '').replace(/^\/+|\/+$/g, '');
    const region =
      this.config.get<string>('AWS_REGION') ??
      this.config.get<string>('AWS_REGION') ??
      process.env.AWS_REGION ??
      'ap-southeast-1';
    this.s3Client = new S3Client({ region });
  }

  async createContract(dto: CreateContractDto) {
    return this.prisma.contract.create({ data: { title: dto.title } });
  }

  async listContracts() {
    const contracts = await this.prisma.contract.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        files: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return contracts.map((contract) => {
      const latestFile = contract.files[0];
      const status = latestFile?.status ?? null;
      const hasReadyFile = status === 'READY';
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { files, ...rest } = contract;
      return {
        ...rest,
        status,
        hasReadyFile,
      };
    });
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

    // Legacy helper kept for backward compatibility with disk-based storage.
    // With S3, download is handled via a separate streaming method.
    return null;
  }

  /**
   * Get S3 object stream and content type for a contract file.
   * Used by controller to stream PDF to the client.
   */
  async getContractFileStream(
    contractId: string,
    fileId: string,
  ): Promise<{ body: AsyncIterable<Uint8Array>; contentType: string }> {
    const contractFile = await this.prisma.contractFile.findFirst({
      where: { id: fileId, contractId },
    });

    if (!contractFile || !contractFile.storagePath || contractFile.storagePath === 'PENDING') {
      throw new NotFoundException('File not found');
    }

    if (!this.s3Bucket) {
      throw new Error('S3_BUCKET is not configured');
    }

    const key = contractFile.storagePath;
    const resp = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
      }),
    );

    if (!resp.Body) {
      throw new Error('Empty body returned from S3');
    }

    const body = resp.Body as unknown as AsyncIterable<Uint8Array>;
    const contentType = resp.ContentType || 'application/pdf';

    return { body, contentType };
  }

  /**
   * Upload PDF, persist to file storage, enqueue ingest job. Returns immediately with 202-style response.
   */
  async uploadAndEnqueue(
    contractId: string,
    file: Express.Multer.File,
    dto: UploadContractFileDto,
  ): Promise<{ contractFileId: string; status: string; message: string }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    const sanitizedOriginalName = path
      .basename(file.originalname || 'document.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

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

    await this.ingestQueue.add(
      'ingest',
      { contractId, contractFileId: contractFile.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    return {
      contractFileId: contractFile.id,
      status: 'PENDING',
      message: 'Processing started. Poll GET /contracts/:id for file status.',
    };
  }

  /**
   * Run full ingest for a contract file (used by worker). Reads file from storagePath, extract -> chunk -> embed -> store.
   */
  async runIngestForFile(contractFileId: string): Promise<void> {
    const contractFile = await this.prisma.contractFile.findUnique({
      where: { id: contractFileId },
    });
    if (!contractFile || !contractFile.storagePath || contractFile.storagePath === 'PENDING') {
      throw new Error(`ContractFile ${contractFileId} not found or storagePath not ready`);
    }

    const key = contractFile.storagePath;

    try {
      if (!this.s3Bucket) {
        throw new Error('AWS_S3_BUCKET is not configured');
      }

      const getResp = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
        }),
      );

      const chunks: Uint8Array[] = [];
      const body = getResp.Body;
      if (!body) {
        throw new Error(`Empty body returned from S3 for key ${key}`);
      }

      for await (const chunk of body as any as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const extractedText = await this.extractTextFromPdfBuffer(buffer);

      await this.prisma.contractFile.update({
        where: { id: contractFileId },
        data: {
          extractedText,
          status: extractedText ? 'EXTRACTED' : 'FAILED',
        },
      });

      if (!extractedText) {
        return;
      }

      const chunkSize = this.config.get<number>('CHUNK_MAX_CHARS') ?? 3500;
      const chunkOverlap = this.config.get<number>('CHUNK_OVERLAP_CHARS') ?? 350;
      const normalizedForChunking = this.normalizeTextForChunking(extractedText);
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
      });
      const splits = await splitter.splitText(normalizedForChunking);
      const documents: Document[] = splits.map((content, i) => ({
        pageContent: content,
        metadata: {
          contractFileId,
          chunkIndex: i,
          chunkId: uuidv4(),
        },
      }));

      await this.storeChunks(contractFileId, documents);
    } catch (err) {
      await this.prisma.contractFile.update({
        where: { id: contractFileId },
        data: { status: 'FAILED' },
      }).catch(() => {});
      throw err;
    }
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
    const normalizedForChunking = this.normalizeTextForChunking(extractedText);
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });
    const splits = await splitter.splitText(normalizedForChunking);
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
    if (!this.s3Bucket) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }

    const keyParts = [];
    if (this.s3Prefix) {
      keyParts.push(this.s3Prefix);
    }
    keyParts.push(contractId, `${contractFileId}.pdf`);
    const key = keyParts.join('/');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );

    await this.prisma.contractFile.update({
      where: { id: contractFileId },
      data: { storagePath: key },
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
