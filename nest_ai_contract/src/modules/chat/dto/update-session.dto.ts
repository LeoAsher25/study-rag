import { IsString, MinLength } from 'class-validator';

export class UpdateSessionDto {
  @IsString()
  @MinLength(1)
  title!: string;
}
