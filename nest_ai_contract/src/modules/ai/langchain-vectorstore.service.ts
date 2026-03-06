import {
  PGVectorStore,
  type DistanceStrategy,
} from '@langchain/community/vectorstores/pgvector';
import type { BaseRetriever } from '@langchain/core/retrievers';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { LangChainAiService } from './langchain-ai.service';

const TABLE_NAME = 'langchain_document_chunks';

@Injectable()
export class LangChainVectorstoreService implements OnModuleDestroy {
  private store: PGVectorStore | null = null;
  private pool: Pool | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly langchainAi: LangChainAiService,
  ) {}

  async onModuleDestroy() {
    if (this.store) {
      await this.store.end?.();
      this.store = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async getOrCreateStore(): Promise<PGVectorStore> {
    if (this.store) return this.store;

    const url = this.config.get<string>('DATABASE_URL');
    if (!url) throw new Error('Missing DATABASE_URL');

    this.pool = new Pool({ connectionString: url });
    const embedModel =
      this.config.get<string>('AWS_BEDROCK_EMBEDDINGS_MODEL') ?? 'amazon.titan-embed-text-v1';
    const dimensions = embedModel.startsWith('cohere.') ? 1024 : 1536;

    this.store = await PGVectorStore.initialize(this.langchainAi.embeddings, {
      pool: this.pool,
      tableName: TABLE_NAME,
      distanceStrategy: 'cosine' as DistanceStrategy,
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'vector',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
      dimensions,
    });
    return this.store;
  }

  async getStore(): Promise<PGVectorStore> {
    return this.getOrCreateStore();
  }

  async getRetriever(contractFileId: string, k: number): Promise<BaseRetriever> {
    const store = await this.getStore();
    return store.asRetriever({
      k,
      filter: { contractFileId },
    });
  }
}
