import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BedrockEmbeddings } from '@langchain/aws';
import { BedrockChat } from '@langchain/community/chat_models/bedrock';
import { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { AwsBedrockService } from './aws-bedrock.service';

/**
 * LangChain-compatible wrapper for AwsBedrockService
 * Handles Cohere models correctly (unlike LangChain's BedrockEmbeddings)
 */
class AwsBedrockEmbeddingsWrapper extends Embeddings {
  constructor(private readonly awsBedrock: AwsBedrockService) {
    super({});
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.awsBedrock.embed(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this.awsBedrock.embed([text]);
    return results[0];
  }
}

@Injectable()
export class LangChainAiService {
  readonly embeddings: EmbeddingsInterface;
  readonly chat: BaseChatModel;

  constructor(
    private readonly config: ConfigService,
    private readonly awsBedrock: AwsBedrockService,
  ) {
    const region = this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1';
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. See .env.example.');
    }

    const embedModel =
      this.config.get<string>('AWS_BEDROCK_EMBEDDINGS_MODEL') ?? 'amazon.titan-embed-text-v1';
    const chatModel =
      this.config.get<string>('AWS_BEDROCK_CHAT_MODEL') ??
      'anthropic.claude-3-haiku-20240307-v1:0';

    // Use our wrapper for Cohere models (LangChain's BedrockEmbeddings doesn't support them)
    // For Titan models, we can use either, but using our wrapper ensures consistency
    if (embedModel.startsWith('cohere.')) {
      this.embeddings = new AwsBedrockEmbeddingsWrapper(this.awsBedrock);
    } else {
      // For Titan models, LangChain's BedrockEmbeddings works fine
      this.embeddings = new BedrockEmbeddings({
        region,
        credentials: { accessKeyId, secretAccessKey },
        model: embedModel,
      });
    }

    // Parse numbers explicitly - ConfigService.get<number>() may return strings from env vars
    const temperatureStr = this.config.get<string>('CHAT_TEMPERATURE');
    const maxTokensStr = this.config.get<string>('CHAT_MAX_TOKENS');
    
    const temperature = temperatureStr ? parseFloat(temperatureStr) : 0.2;
    const maxTokens = maxTokensStr ? parseInt(maxTokensStr, 10) : 700;
    
    // Validate parsed numbers
    if (isNaN(temperature) || temperature < 0 || temperature > 2) {
      throw new Error(`Invalid CHAT_TEMPERATURE: ${temperatureStr}. Must be a number between 0 and 2.`);
    }
    if (isNaN(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
      throw new Error(`Invalid CHAT_MAX_TOKENS: ${maxTokensStr}. Must be a number between 1 and 4096.`);
    }
    
    this.chat = new BedrockChat({
      model: chatModel,
      region,
      credentials: { accessKeyId, secretAccessKey },
      temperature,
      maxTokens,
      streaming: false, // Explicitly set streaming mode
    });
  }
}
