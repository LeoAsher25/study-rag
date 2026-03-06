import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UploadContractFileDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const num = Number(value);
    return isNaN(num) ? value : num;
  })
  @IsInt()
  @Min(1)
  versionNumber?: number;
}
