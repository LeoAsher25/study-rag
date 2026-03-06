import { IsString, MinLength } from 'class-validator';

export class CreateContractDto {
  @IsString()
  @MinLength(1)
  title!: string;
}
