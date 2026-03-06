import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Post('sessions')
  createSession(@Body() dto: CreateSessionDto) {
    return this.service.createSession(dto);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.service.getSession(id);
  }

  @Patch('sessions/:id')
  updateSessionTitle(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.service.updateSessionTitle(id, dto.title);
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string) {
    return this.service.deleteSession(id);
  }

  @Get('contracts/:contractId/sessions')
  getContractSessions(@Param('contractId') contractId: string) {
    return this.service.getContractSessions(contractId);
  }

  @Post('messages')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  async send(@Body() dto: SendMessageDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      for await (const chunk of this.service.streamMessage(dto)) {
        res.write(chunk);
      }
      res.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      res.end();
    }
  }

  @Post('messages/stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  async streamMessage(@Body() dto: SendMessageDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      for await (const chunk of this.service.streamMessage(dto)) {
        res.write(chunk);
      }
      res.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      res.end();
    }
  }
}
