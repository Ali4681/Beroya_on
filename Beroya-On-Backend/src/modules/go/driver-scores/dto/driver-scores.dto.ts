import { ApiPropertyOptional } from '@nestjs/swagger';
import { GoDriverScoreBand } from '@/generated/prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { SCORE_SORTS, type ScoreSort } from '../driver-scores.service';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class DriverScoresQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({ enum: GoDriverScoreBand })
  @IsOptional()
  @IsEnum(GoDriverScoreBand)
  band?: GoDriverScoreBand;

  @ApiPropertyOptional({ enum: SCORE_SORTS, default: 'score' })
  @IsOptional()
  @IsIn(SCORE_SORTS)
  sort?: ScoreSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Default: desc (asc for cancel_pct).' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ example: '2026-10-12', description: 'Snapshot day. Default: the latest one.' })
  @IsOptional()
  @Matches(DAY, { message: 'day must be YYYY-MM-DD' })
  day?: string;
}

export class RecomputeScoresDto {
  @ApiPropertyOptional({ example: '2026-10-12', description: 'Ended incentive day. Default: yesterday.' })
  @IsOptional()
  @Matches(DAY, { message: 'day must be YYYY-MM-DD' })
  day?: string;
}
