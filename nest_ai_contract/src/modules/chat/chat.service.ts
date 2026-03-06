import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainAiService } from '../ai/langchain-ai.service';
import { LangChainVectorstoreService } from '../ai/langchain-vectorstore.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

interface RagContext {
  session: { id: string; contract: { files: Array<{ id: string; status: string }> } };
  contractFileId: string;
  messages: BaseMessage[];
  citations: Array<{ n: number; chunkId: string; chunkIndex: number; distance?: number }>;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly langchainAi: LangChainAiService,
    private readonly vectorstore: LangChainVectorstoreService,
  ) {}

  async createSession(dto: CreateSessionDto) {
    const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
    if (!contract) throw new Error(`Contract not found: ${dto.contractId}`);

    const title = dto.firstMessage
      ? dto.firstMessage.slice(0, 50) + (dto.firstMessage.length > 50 ? '...' : '')
      : null;

    return this.prisma.chatSession.create({
      data: {
        contractId: dto.contractId,
        title,
      },
    });
  }

  async updateSessionTitle(sessionId: string, title: string) {
    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { title },
    });
  }

  async deleteSession(sessionId: string) {
    return this.prisma.chatSession.delete({
      where: { id: sessionId },
    });
  }

  async getSession(sessionId: string) {
    return this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getContractSessions(contractId: string) {
    return this.prisma.chatSession.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  private getSystemPrompt(): string {
    return (
      this.config.get<string>('RAG_SYSTEM_PROMPT') ??
      'You are a contract analysis assistant. Answer based ONLY on the provided context. If the context is insufficient, say so. Provide a concise answer and cite the chunk numbers you used (e.g., [#1], [#3]).'
    );
  }

  private async prepareRagContext(dto: SendMessageDto): Promise<RagContext> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: dto.sessionId },
      include: { contract: { include: { files: { orderBy: { createdAt: 'desc' } } } } },
    });
    if (!session) throw new Error(`Chat session not found: ${dto.sessionId}`);

    const contractFileId =
      dto.contractFileId ??
      session.contract.files.find((f: { status: string }) => f.status === 'READY')?.id;
    if (!contractFileId) {
      throw new Error('No READY contract file found. Upload and ingest a PDF first, or pass contractFileId.');
    }

    await this.prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: dto.message },
    });

    const topK = this.config.get<number>('RAG_TOP_K') ?? 8;
    const retriever = await this.vectorstore.getRetriever(contractFileId, topK);
    const retrieved = await retriever.invoke(dto.message);

    const contextText = retrieved
      .map(
        (doc, i) =>
          `[#${i + 1} chunk=${(doc.metadata?.chunkId as string) ?? 'n/a'} idx=${(doc.metadata?.chunkIndex as number) ?? i}]\n${doc.pageContent}`,
      )
      .join('\n\n---\n\n');

    console.log('Context text: ', contextText, 'Retrieved: ', retrieved);

    const systemPrompt = this.getSystemPrompt();
    const userContent = `Context:\n${contextText}\n\nUser question: ${dto.message}`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ];

    const citations = retrieved.map((doc, i) => ({
      n: i + 1,
      chunkId: (doc.metadata?.chunkId as string) ?? '',
      chunkIndex: (doc.metadata?.chunkIndex as number) ?? i,
      distance: doc.metadata?.distance != null ? Number(doc.metadata.distance) : undefined,
    }));

    return { session, contractFileId, messages, citations };
  }

  async sendMessage(dto: SendMessageDto) {
    const { session, contractFileId, messages, citations } = await this.prepareRagContext(dto);

    const response = await this.langchainAi.chat.invoke(messages);
    const answer = typeof response.content === 'string' ? response.content : String(response.content ?? '');

    const saved = await this.prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: answer, citations },
    });

    return {
      sessionId: session.id,
      contractFileId,
      answer: saved.content,
      citations,
    };
  }

  /**
   * Stream message with RAG - returns SSE events in Vercel AI SDK format
   */
  async *streamMessage(dto: SendMessageDto): AsyncGenerator<string, void, unknown> {
    const { session, messages, citations } = await this.prepareRagContext(dto);

    let fullAnswer = '';
    try {
      yield `data: ${JSON.stringify({ type: 'start' })}\n\n`;

      const stream = await this.langchainAi.chat.stream(messages);
      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : String(chunk.content ?? '');
        if (text) {
          fullAnswer += text;
          yield `data: ${JSON.stringify({ type: 'text-delta', delta: text })}\n\n`;
        }
      }

      await this.prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'assistant', content: fullAnswer, citations },
      });

      yield `data: ${JSON.stringify({ type: 'data', citations })}\n\n`;
      yield `data: ${JSON.stringify({ type: 'end' })}\n\n`;
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await this.prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'assistant', content: errorMessage },
      });
      yield `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`;
    }
  }
}
