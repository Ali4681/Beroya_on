import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoLedgerDirection, GoStoreLedgerType, GoStoreStatus } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { AMOUNT_PATTERN } from '../store-money';

const STAFF_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const AMOUNT_MSG = 'must be a positive number with at most 2 decimals';

/** Money arrives as a decimal string (or a JSON number) and is parsed with Prisma.Decimal, never as a float. */
const toAmountText = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

export class CreateStoreDto {
  @ApiProperty({ example: 'سوبرماركت الشام' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'أحمد الخطيب' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  owner_name!: string;

  @ApiProperty({ example: '0912345678', description: 'Owner mobile number; stored as E.164' })
  @IsString()
  @MaxLength(32)
  mobile_number!: string;

  @ApiProperty({ description: 'Branch (governorate) that manages the store' })
  @IsUUID()
  branch_id!: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: '100000', description: 'Warn when the balance falls to or below this' })
  @IsOptional()
  @Transform(toAmountText)
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, { message: `low_balance_threshold ${AMOUNT_MSG}` })
  low_balance_threshold?: string;

  @ApiPropertyOptional({ example: '500000', description: 'Largest single recharge; empty = no limit' })
  @Transform(({ value }) => emptyToUndefined({ value: toAmountText({ value }) }))
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: `max_recharge_amount ${AMOUNT_MSG}` })
  max_recharge_amount?: string;
}

/** Store info only. Balance and status have their own audited endpoints. */
export class UpdateStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  owner_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mobile_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toAmountText)
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, { message: `low_balance_threshold ${AMOUNT_MSG}` })
  low_balance_threshold?: string;

  @ApiPropertyOptional({ description: "Empty string clears the limit" })
  @IsOptional()
  @Transform(toAmountText)
  @Matches(/^(\d{1,16}(\.\d{1,2})?)?$/, { message: `max_recharge_amount ${AMOUNT_MSG}` })
  max_recharge_amount?: string;
}

export class StoreStatusDto {
  @ApiProperty({ enum: GoStoreStatus })
  @IsIn(Object.values(GoStoreStatus))
  status!: GoStoreStatus;

  @ApiPropertyOptional({ description: 'Optional: why the status changed (shown in the audit history)' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class StoreCreditDto {
  @ApiProperty({ example: '1000000', description: 'Positive amount added to the store balance' })
  @Transform(toAmountText)
  @Matches(AMOUNT_PATTERN, { message: `amount ${AMOUNT_MSG}` })
  amount!: string;

  @ApiProperty({ example: 'SYP' })
  @IsString()
  @MaxLength(3)
  currency!: string;

  @ApiPropertyOptional({ description: 'Cash receipt / bank transfer number' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  external_reference?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class StoreAdjustmentDto {
  @ApiProperty({ enum: GoLedgerDirection })
  @IsIn(Object.values(GoLedgerDirection))
  direction!: GoLedgerDirection;

  @ApiProperty({ example: '25000' })
  @Transform(toAmountText)
  @Matches(AMOUNT_PATTERN, { message: `amount ${AMOUNT_MSG}` })
  amount!: string;

  @ApiProperty({ example: 'SYP' })
  @IsString()
  @MaxLength(3)
  currency!: string;

  @ApiProperty({ description: 'Mandatory justification' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class ReverseRechargeDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class CreateStoreOperatorDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name!: string;

  @ApiProperty({ description: 'Login email' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional({ description: 'Optional login phone' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STAFF_PASSWORD, { message: 'Password must contain at least one letter and one digit' })
  password!: string;
}

export class UpdateStoreOperatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Reset password (revokes the operator sessions)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STAFF_PASSWORD, { message: 'Password must contain at least one letter and one digit' })
  password?: string;
}

export const STORE_SORT_FIELDS = ['created_at', 'name', 'balance', 'code'] as const;
export type StoreSortField = (typeof STORE_SORT_FIELDS)[number];

export class ListStoresQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, code, owner or mobile number' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: GoStoreStatus })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(Object.values(GoStoreStatus))
  status?: GoStoreStatus;

  @ApiPropertyOptional({ enum: ['LOW', 'ZERO', 'OK'] })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(['LOW', 'ZERO', 'OK'])
  balance?: 'LOW' | 'ZERO' | 'OK';

  @ApiPropertyOptional({ enum: STORE_SORT_FIELDS })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(STORE_SORT_FIELDS)
  sort?: StoreSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class StoreLedgerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoStoreLedgerType })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(Object.values(GoStoreLedgerType))
  type?: GoStoreLedgerType;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class StoreStatsQueryDto {
  @ApiPropertyOptional({ description: 'Days back (default 30)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(366)
  days?: number;
}

// ---------- POS (store operator) ----------

export class DriverLookupDto {
  @ApiProperty({ example: '0912345678' })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  mobile_number!: string;
}

export class PosRechargeDto {
  @ApiProperty({ example: '0912345678' })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  mobile_number!: string;

  @ApiProperty({ example: '50000' })
  @Transform(toAmountText)
  @Matches(AMOUNT_PATTERN, { message: `amount ${AMOUNT_MSG}` })
  amount!: string;

  @ApiProperty({ example: 'SYP' })
  @IsString()
  @MaxLength(3)
  currency!: string;
}

export class PosTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Driver mobile number' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mobile_number?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  reference?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @Transform(toAmountText)
  @Matches(AMOUNT_PATTERN, { message: `amount ${AMOUNT_MSG}` })
  amount?: string;

  @ApiPropertyOptional({ enum: ['COMPLETED', 'REVERSED'] })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(['COMPLETED', 'REVERSED'])
  status?: 'COMPLETED' | 'REVERSED';
}
