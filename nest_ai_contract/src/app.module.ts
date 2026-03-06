import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { winstonModuleOptions } from './config/winston.config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { ChatModule } from './modules/chat/chat.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot(winstonModuleOptions),
    PrismaModule,
    AiModule,
    ContractsModule,
    ChatModule,
  ],
})
export class AppModule {}
