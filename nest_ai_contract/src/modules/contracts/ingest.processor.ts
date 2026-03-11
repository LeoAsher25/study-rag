import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ContractsService } from './contracts.service';

@Processor('ingest')
export class IngestProcessor extends WorkerHost {
  constructor(private readonly contractsService: ContractsService) {
    super();
  }

  async process(job: Job<{ contractId: string; contractFileId: string }>): Promise<void> {
    await this.contractsService.runIngestForFile(job.data.contractFileId);
  }
}
