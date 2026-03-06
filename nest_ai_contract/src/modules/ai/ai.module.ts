import { Module } from '@nestjs/common';
import { LangChainAiService } from './langchain-ai.service';
import { LangChainVectorstoreService } from './langchain-vectorstore.service';
import { AwsBedrockService } from './aws-bedrock.service';

@Module({
  providers: [AwsBedrockService, LangChainAiService, LangChainVectorstoreService],
  exports: [AwsBedrockService, LangChainAiService, LangChainVectorstoreService],
})
export class AiModule {}
