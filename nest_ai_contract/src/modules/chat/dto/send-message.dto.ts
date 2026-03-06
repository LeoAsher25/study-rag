import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsUUID()
  contractFileId?: string;
}
