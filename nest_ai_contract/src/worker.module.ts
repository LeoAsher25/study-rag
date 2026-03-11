import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppModule } from './app.module';
import { IngestProcessor } from './modules/contracts/ingest.processor';

@Module({
  imports: [
    AppModule,
    BullModule.registerQueue({ name: 'ingest' }),
  ],
  providers: [IngestProcessor],
})
export class WorkerModule {}
