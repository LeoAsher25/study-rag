import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Injectable } from '@nestjs/common';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

@Injectable()
export class AwsBedrockService {
  private readonly client: BedrockRuntimeClient;
  private readonly region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'ap-southeast-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. See .env.example.',
      );
    }

    this.client = new BedrockRuntimeClient({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Generate embeddings using AWS Bedrock embedding models
   * Supported models:
   * - Amazon Titan: ~$0.02 per 1K tokens, Dimension: 1536 (v1) or 1024 (v2)
   * - Cohere Embed Multilingual v3: Dimension: 1024, Max length: 2048 chars
   * Set AWS_BEDROCK_EMBEDDINGS_MODEL in .env to choose model
   */
  async embed(texts: string[]): Promise<number[][]> {
    const configuredModelId = process.env.AWS_BEDROCK_EMBEDDINGS_MODEL;
    // Default to v1 as it's more widely available
    const defaultModelId = 'amazon.titan-embed-text-v1';
    const modelId = configuredModelId || defaultModelId;

    // Get max length for the model
    const maxLength = this.getMaxTextLength(modelId);

    // Process in parallel for better performance
    const promises = texts.map(async (text) => {
      // Validate and truncate if necessary
      let processedText = text;
      if (text.length > maxLength) {
        processedText = text.substring(0, maxLength);
        console.warn(`Text truncated from ${text.length} to ${maxLength} characters for model ${modelId}`);
      }
      let lastError: Error | null = null;
      
      // Try configured/default model first
      try {
        return await this.tryEmbedWithModel(modelId, processedText);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If using default and it fails, try v2 as fallback
        if (!configuredModelId && modelId === defaultModelId) {
          try {
            return await this.tryEmbedWithModel('amazon.titan-embed-text-v2:0', text);
          } catch (fallbackError) {
            // Use original error
          }
        }
        
        // Provide more helpful error messages
        let errorMessage = 'Unknown error';
        if (lastError instanceof Error) {
          errorMessage = lastError.message;
          
          // Check for common AWS Bedrock issues
          if (errorMessage.includes('model identifier is invalid') || errorMessage.includes('Invalid model')) {
            errorMessage = `AWS Bedrock: Invalid embedding model ID "${modelId}". Please:\n1. Enable model access in AWS Bedrock console (Model access)\n2. Request access to: amazon.titan-embed-text-v1 or amazon.titan-embed-text-v2:0\n3. Set AWS_BEDROCK_EMBEDDINGS_MODEL in .env if using a different model\n4. Verify region is correct (${this.region})`;
          } else if (errorMessage.includes('AccessDeniedException') || errorMessage.includes('AccessDenied')) {
            errorMessage = 'AWS Bedrock: Access denied. Please check your AWS credentials and model access permissions.';
          } else if (errorMessage.includes('ValidationException')) {
            errorMessage = `AWS Bedrock: Validation error - ${errorMessage}`;
          }
        }
        
        throw new Error(`Failed to generate embedding: ${errorMessage}`);
      }
    });

    const results = await Promise.all(promises);
    return results;
  }

  /**
   * Get maximum text length for a given embedding model
   */
  private getMaxTextLength(modelId: string): number {
    if (modelId.startsWith('cohere.')) {
      // Cohere Embed v3: 2048 chars per request; use 2040 for safety (encoding/token rounding)
      return 2040;
    } else if (modelId.startsWith('amazon.titan-embed')) {
      // Amazon Titan models have much higher limits (typically 8000 tokens)
      // Using a conservative 8000 characters as limit
      return 8000;
    }
    // Default to 8000 for unknown models
    return 8000;
  }

  private async tryEmbedWithModel(modelId: string, text: string): Promise<number[]> {
    // Determine request format based on model provider
    const isCohere = modelId.startsWith('cohere.');
    const isTitan = modelId.startsWith('amazon.titan-embed');
    
    let requestBody: any;
    
    if (isCohere) {
      // Cohere Embed v3 format
      // For search/retrieval use cases, use "search_document" for documents and "search_query" for queries
      const inputType = process.env.COHERE_INPUT_TYPE || 'search_document';
      requestBody = {
        texts: [text],
        input_type: inputType,
        truncate: 'END', // allow model to truncate if near limit; avoids "Invalid parameter combination" at 2048
      };
    } else if (isTitan) {
      // Amazon Titan format
      requestBody = {
        inputText: text,
      };
    } else {
      // Default to Titan format for unknown models
      requestBody = {
        inputText: text,
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body),
    );

    // Parse response based on model provider
    let embedding: number[];
    
    if (isCohere) {
      // Cohere returns: { embeddings: number[][] }
      // Dimension: 1024 for embed-multilingual-v3
      if (!responseBody.embeddings || !Array.isArray(responseBody.embeddings) || responseBody.embeddings.length === 0) {
        throw new Error('Unexpected embeddings response from Cohere model');
      }
      embedding = responseBody.embeddings[0] as number[];
    } else {
      // Amazon Titan returns: { embedding: number[] }
      // Dimension: 1536 for v1, 1024 for v2
      if (!responseBody.embedding || !Array.isArray(responseBody.embedding)) {
        throw new Error('Unexpected embeddings response from AWS Bedrock');
      }
      embedding = responseBody.embedding as number[];
    }

    return embedding;
  }

  /**
   * Chat completion using AWS Bedrock (Claude or Titan)
   * Cost: Varies by model (Claude Haiku ~$0.25/$1.25 per 1M tokens)
   */
  async chat(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    const modelId =
      process.env.AWS_BEDROCK_CHAT_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0';

    // Convert messages to Claude format
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const claudeMessages = conversationMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));

    const requestBody: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: opts?.maxTokens ?? 700,
      temperature: opts?.temperature ?? 0.2,
      messages: claudeMessages,
    };

    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Claude returns: { content: [{ type: "text", text: "..." }] }
      const content = responseBody.content?.[0]?.text;
      if (typeof content !== 'string') {
        throw new Error('Unexpected chat response from AWS Bedrock');
      }

      return content;
    } catch (error) {
      throw new Error(
        `Failed to generate chat response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Streaming chat completion using AWS Bedrock
   * Returns an async generator that yields Vercel AI SDK format events
   */
  async *chatStream(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): AsyncGenerator<{ type: string; delta?: string; text?: string; data?: any }, void, unknown> {
    const modelId =
      process.env.AWS_BEDROCK_CHAT_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0';

    // Convert messages to Claude format
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const claudeMessages = conversationMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));

    const requestBody: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: opts?.maxTokens ?? 700,
      temperature: opts?.temperature ?? 0.2,
      messages: claudeMessages,
    };

    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    try {
      // Yield start event
      yield { type: 'start' };

      const response = await this.client.send(command);
      const decoder = new TextDecoder();
      let fullText = '';

      if (!response.body) {
        throw new Error('No response body from AWS Bedrock');
      }

      // Process stream chunks
      for await (const chunk of response.body) {
        if (chunk.chunk) {
          const chunkData = JSON.parse(decoder.decode(chunk.chunk.bytes));

          // Handle different event types from Claude streaming
          if (chunkData.type === 'content_block_delta') {
            const delta = chunkData.delta?.text || '';
            if (delta) {
              fullText += delta;
              yield { type: 'text-delta', delta };
            }
          } else if (chunkData.type === 'content_block_start') {
            yield { type: 'text-start' };
          } else if (chunkData.type === 'content_block_stop') {
            yield { type: 'text-end' };
          } else if (chunkData.type === 'message_stop') {
            // Final message
            yield { type: 'end', text: fullText };
          }
        }
      }
    } catch (error) {
      // Provide more helpful error messages for common AWS Bedrock issues
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Check for common AWS Bedrock setup issues
        if (errorMessage.includes('use case details')) {
          errorMessage = 'AWS Bedrock: Model access not enabled. Please enable Anthropic Claude model access in AWS Bedrock console and submit use case details.';
        } else if (errorMessage.includes('AccessDeniedException')) {
          errorMessage = 'AWS Bedrock: Access denied. Please check your AWS credentials and model access permissions.';
        } else if (errorMessage.includes('ValidationException')) {
          errorMessage = `AWS Bedrock: Validation error - ${errorMessage}`;
        }
      }
      
      throw new Error(`Failed to stream chat response: ${errorMessage}`);
    }
  }
}
