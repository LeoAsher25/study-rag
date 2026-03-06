import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  contractId!: string;

  @IsOptional()
  @IsString()
  firstMessage?: string;
}
