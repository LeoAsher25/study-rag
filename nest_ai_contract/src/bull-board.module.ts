import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HttpAdapterHost } from '@nestjs/core';
import { ContractsModule } from './modules/contracts/contracts.module';

@Module({
  imports: [
    ContractsModule,
    BullModule.registerQueue({ name: 'ingest' }),
  ],
})
export class BullBoardModule implements OnModuleInit {
  constructor(
    @InjectQueue('ingest') private readonly ingestQueue: Queue,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  onModuleInit() {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    if (!httpAdapter) {
      return;
    }

    // This assumes Nest is using the Express adapter (the default in this project)
    const app = httpAdapter.getInstance();

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [new BullMQAdapter(this.ingestQueue)],
      serverAdapter,
    });

    app.use('/admin/queues', serverAdapter.getRouter());
  }
}

