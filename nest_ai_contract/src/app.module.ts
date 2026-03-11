import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WinstonModule } from 'nest-winston';
import { winstonModuleOptions } from './config/winston.config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { ChatModule } from './modules/chat/chat.module';
import { AiModule } from './modules/ai/ai.module';
import { BullBoardModule } from './bull-board.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot(winstonModuleOptions),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        const u = new URL(url);
        return {
          connection: {
            host: u.hostname,
            port: parseInt(u.port || '6379', 10),
            password: u.password || undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    AiModule,
    ContractsModule,
    ChatModule,
    BullBoardModule,
  ],
  exports: [ContractsModule],
})
export class AppModule {}
