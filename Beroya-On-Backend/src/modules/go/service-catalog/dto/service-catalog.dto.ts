import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoServiceCode } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum ServiceOfferType {
  DISCOUNT = 'DISCOUNT',
  PROMOTION = 'PROMOTION',
}

const trimToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class ServiceOfferDto {
  @ApiProperty({ enum: ServiceOfferType }) type!: ServiceOfferType;
  @ApiProperty({
    nullable: true,
    example: 15,
    description:
      'Fare cut % for the customer. Company absorbs the difference; driver commission stays on gross. Null on PROMOTION = badge only.',
  })
  percentage!: number | null;
  @ApiProperty({ example: '15%' }) label_ar!: string;
  @ApiProperty({ nullable: true, description: 'null = no end date' }) expires_at!: Date | null;
  @ApiProperty({ nullable: true, description: 'DISCOUNT only: send as discount_code_id when booking' })
  discount_code_id!: string | null;
  @ApiProperty({ nullable: true, example: 'WELCOME20', description: 'DISCOUNT only' }) code!: string | null;
}

export class PublicServiceDto {
  @ApiProperty({ enum: GoServiceCode }) code!: GoServiceCode;
  @ApiProperty({ example: 'يومي' }) name_ar!: string;
  @ApiProperty({ nullable: true, example: 'Daily' }) name_en!: string | null;
  @ApiProperty({
    nullable: true,
    example: '/api/v1/go/customer/services/DAILY/image?v=1760263200000',
    description: 'Relative to the API host. null when no image was uploaded.',
  })
  image_url!: string | null;
  @ApiProperty({ description: 'false = show "coming soon"' }) is_available!: boolean;
  @ApiProperty({ example: 1 }) sort_order!: number;
  @ApiProperty({ type: ServiceOfferDto, nullable: true, description: 'null = no badge' })
  offer!: ServiceOfferDto | null;
}

export class AdminServiceDto {
  @ApiProperty({ enum: GoServiceCode }) code!: GoServiceCode;
  @ApiProperty() name_ar!: string;
  @ApiProperty({ nullable: true }) name_en!: string | null;
  @ApiProperty({ nullable: true }) image_url!: string | null;
  @ApiProperty() is_available!: boolean;
  @ApiProperty() is_visible!: boolean;
  @ApiProperty() sort_order!: number;
  @ApiProperty({ nullable: true }) promotion_label_ar!: string | null;
  @ApiProperty({
    nullable: true,
    example: 15,
    description: 'Customer pays this % less; company absorbs. Driver earnings stay on gross.',
  })
  promotion_percentage!: number | null;
  @ApiProperty({ nullable: true }) promotion_expires_at!: Date | null;
  @ApiProperty({ description: 'ACTIVE discount codes linked to this service' }) active_discount_codes!: number;
  @ApiProperty() updated_at!: Date;
}

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'يومي' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name_ar?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name_en?: string | null;

  @ApiPropertyOptional({ description: 'Replace the image: JPEG, PNG, or WebP bytes encoded as base64 (max 2 MB)' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(2_800_000)
  image?: string;

  @ApiPropertyOptional({ description: 'true deletes the current image' })
  @IsOptional()
  @IsBoolean()
  remove_image?: boolean;

  @ApiPropertyOptional({ description: 'false = customers see "coming soon"' })
  @IsOptional()
  @IsBoolean()
  is_available?: boolean;

  @ApiPropertyOptional({ description: 'false = hidden from customers' })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ nullable: true, example: '15%', description: 'Badge text; null removes the promotion' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(40)
  promotion_label_ar?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 15,
    description: 'Customer pays this % less; company absorbs (driver stays on gross). Null clears.',
  })
  @IsOptional()
  @ValidateIf((o: UpdateServiceDto) => o.promotion_percentage !== undefined && o.promotion_percentage !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  promotion_percentage?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = no end date' })
  @ValidateIf((o: UpdateServiceDto) => o.promotion_expires_at !== undefined && o.promotion_expires_at !== null)
  @IsDateString()
  promotion_expires_at?: string | null;
}

export class ReorderServicesDto {
  @ApiProperty({ enum: GoServiceCode, isArray: true, description: 'Every service code, in display order' })
  @IsArray()
  @ArrayUnique()
  @IsEnum(GoServiceCode, { each: true })
  codes!: GoServiceCode[];
}
