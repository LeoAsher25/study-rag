import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ChatDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  contractFileId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  topK?: number;
}
