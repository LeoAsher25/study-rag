import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UploadContractFileDto } from './dto/upload-contract-file.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Post()
  create(@Body() dto: CreateContractDto) {
    return this.service.createContract(dto);
  }

  @Get()
  list() {
    return this.service.listContracts();
  }

  /**
   * Download/serve a contract PDF file
   * Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/files/:fileId')
  async getFile(
    @Param('id') contractId: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const filePath = await this.service.getContractFilePath(contractId, fileId);
    if (!filePath) {
      return res.status(404).json({ message: 'File not found' });
    }
    return res.sendFile(filePath, {
      headers: {
        'Content-Type': 'application/pdf',
      },
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getContract(id);
  }

  /**
   * Upload a contract PDF and ingest it (extract text -> chunk -> embed -> store in pgvector)
   * Multipart form-data:
   * - file: PDF
   * - versionNumber (optional)
   */
  @Post(':id/files/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Store file in memory as buffer
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
      fileFilter: (req, file, cb) => {
        if (!file) {
          return cb(new BadRequestException('No file provided'), false);
        }
        // Validate MIME type
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new BadRequestException('Only PDF files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadAndIngest(
    @Param('id') contractId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadContractFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('Missing file');
    }
    return this.service.uploadPdfAndIngest(contractId, file, dto);
  }
}
