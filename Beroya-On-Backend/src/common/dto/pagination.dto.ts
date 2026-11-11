import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Limit results to one branch. Global roles only; others stay on their own branch.' })
  @IsOptional()
  @IsUUID()
  branch_id?: string;
}

export function pageSkip(page = 1, limit = 20) {
  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit)) || 20));
  return { skip: (safePage - 1) * safeLimit, take: safeLimit };
}
