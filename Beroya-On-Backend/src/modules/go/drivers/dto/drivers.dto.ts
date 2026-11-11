import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoDocumentType, GoDriverGender, GoDriverKind, GoRideRequirementType } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { E164, normalizeE164 } from '../../auth/phone';
import { normalizeLanguageCode, WORLD_LANGUAGE_CODES } from '../world-languages';

export const DRIVER_LIST_STATES = ['active', 'suspended', 'blocked', 'disabled'] as const;
export type DriverListState = (typeof DRIVER_LIST_STATES)[number];

export class DriverListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '0992',
    description: 'Name (Arabic spelling variants match), phone in any format or partial digits, or plate number',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: DRIVER_LIST_STATES })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(DRIVER_LIST_STATES)
  state?: DriverListState;
}

export class DriverDocumentInput {
  @ApiProperty({ enum: GoDocumentType, enumName: 'GoDocumentType' })
  @IsEnum(GoDocumentType)
  type!: GoDocumentType;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expires_at?: Date;

  @ApiProperty({ description: 'Front photo: JPEG, PNG, or WebP bytes encoded as base64' })
  @IsString()
  @MinLength(32)
  @MaxLength(5_500_000)
  image!: string;

  @ApiPropertyOptional({ description: 'Back photo: JPEG, PNG, or WebP bytes encoded as base64' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(5_500_000)
  image_back?: string;
}

export class CreateDriverVehicleInput {
  @ApiProperty({ example: '12345/67', description: 'Digits, / and \\ only' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9/\\]+$/, { message: 'plate_number may only contain digits, / and \\' })
  plate_number!: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Deprecated — prefer ride_category_ids. Kept for older clients.',
  })
  @IsOptional()
  @IsUUID()
  ride_category_id?: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    description:
      'One or more ride categories this vehicle serves. Dispatch offers the driver for any matching request.',
  })
  @Transform(({ value, obj }) => mergeCategoryIds(value, obj?.ride_category_id))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ride_category_ids!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  year?: number;

  @ApiPropertyOptional({
    enum: [
      GoRideRequirementType.CHILD_SEAT,
      GoRideRequirementType.EXTRA_LUGGAGE,
      GoRideRequirementType.ACCESSIBILITY,
      GoRideRequirementType.PERSONAL_ASSISTANCE,
      GoRideRequirementType.WHEELCHAIR,
    ],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(GoRideRequirementType, { each: true })
  capabilities?: GoRideRequirementType[];
}

function mergeCategoryIds(value: unknown, singular?: unknown) {
  const fromArray = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item) : [];
  const fromSingular = typeof singular === 'string' && singular ? [singular] : [];
  return [...new Set([...fromArray, ...fromSingular])];
}

export class CreateDriverDto {
  @ApiProperty({ example: '+963933333333', description: 'Driver app login. OTP is sent to this number.' })
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: 'phone must be a valid E.164 number, e.g. +963912345678' })
  phone: string;

  @ApiProperty({ example: 'New Driver' })
  @IsString()
  @MaxLength(120)
  full_name: string;

  @ApiPropertyOptional({
    enum: GoDriverKind,
    enumName: 'GoDriverKind',
    default: GoDriverKind.EXTERNAL,
    description:
      'EXTERNAL: create with vehicle + vehicle docs. BEROYA: profile only — link a vehicle later from Vehicles.',
  })
  @IsOptional()
  @IsEnum(GoDriverKind)
  kind?: GoDriverKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({ enum: GoDriverGender, enumName: 'GoDriverGender' })
  @IsOptional()
  @IsEnum(GoDriverGender)
  gender?: GoDriverGender;

  @ApiProperty({ example: 'ar', description: 'Mother tongue as ISO 639-1 code' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeLanguageCode(value) : value))
  @IsIn(WORLD_LANGUAGE_CODES)
  mother_tongue!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['en', 'tr'],
    description: 'Additional spoken languages as ISO 639-1 codes',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? normalizeLanguageCode(item) : item)) : value,
  )
  @IsIn(WORLD_LANGUAGE_CODES, { each: true })
  languages?: string[];

  @ApiProperty({
    type: [DriverDocumentInput],
    description: 'EXTERNAL: LICENSE, VEHICLE_REGISTRATION, INSURANCE, IDENTITY. BEROYA: LICENSE + IDENTITY only.',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentInput)
  documents!: DriverDocumentInput[];

  @ApiPropertyOptional({ type: CreateDriverVehicleInput, description: 'Required for EXTERNAL drivers' })
  @ValidateIf((dto: CreateDriverDto) => (dto.kind ?? GoDriverKind.EXTERNAL) === GoDriverKind.EXTERNAL)
  @ValidateNested()
  @Type(() => CreateDriverVehicleInput)
  vehicle?: CreateDriverVehicleInput;

  @ApiPropertyOptional({
    type: [String],
    minItems: 2,
    maxItems: 6,
    description: 'Car photos for EXTERNAL drivers: 2–6 JPEG/PNG/WebP images encoded as base64',
  })
  @ValidateIf((dto: CreateDriverDto) => (dto.kind ?? GoDriverKind.EXTERNAL) === GoDriverKind.EXTERNAL)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(32, { each: true })
  @MaxLength(5_500_000, { each: true })
  vehicle_photos?: string[];
}

export class UpdateDriverDto {
  @ApiPropertyOptional({
    example: '+963933333333',
    description: 'New driver app login number (local 09… accepted). Signs the driver out of every device.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: 'phone must be a valid E.164 number, e.g. +963912345678' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string | null;

  @ApiPropertyOptional({ enum: GoDriverGender, enumName: 'GoDriverGender' })
  @IsOptional()
  @IsEnum(GoDriverGender)
  gender?: GoDriverGender;

  @ApiPropertyOptional({
    example: '1990-05-12',
    nullable: true,
    description: 'YYYY-MM-DD birthday for admin notification filters / dashboard',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_of_birth must be YYYY-MM-DD' })
  @IsDateString({ strict: true })
  date_of_birth?: string | null;

  @ApiPropertyOptional({ example: 'ar', description: 'Mother tongue as ISO 639-1 code' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeLanguageCode(value) : value))
  @IsIn(WORLD_LANGUAGE_CODES)
  mother_tongue?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['en', 'tr'],
    description: 'Additional spoken languages as ISO 639-1 codes',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? normalizeLanguageCode(item) : item)) : value,
  )
  @IsIn(WORLD_LANGUAGE_CODES, { each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_suspended?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suspended_reason?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  operational_blocked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operational_reason?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  active_vehicle_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  user_is_active?: boolean;

  @ApiPropertyOptional({ description: 'Driver photo shown to customers: base64 JPEG/PNG/WebP, max 2 MB' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(2_800_000)
  avatar?: string;

  @ApiPropertyOptional({ description: 'true deletes the current photo' })
  @IsOptional()
  @IsBoolean()
  remove_avatar?: boolean;
}

export class UpsertDocumentDto {
  @ApiProperty({ enum: GoDocumentType, enumName: 'GoDocumentType' })
  @IsEnum(GoDocumentType)
  type: GoDocumentType;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expires_at?: Date | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_valid?: boolean;

  @ApiPropertyOptional({ description: 'Front photo: JPEG, PNG, or WebP bytes encoded as base64' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(5_500_000)
  image?: string;

  @ApiPropertyOptional({ description: 'Back photo: JPEG, PNG, or WebP bytes encoded as base64' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(5_500_000)
  image_back?: string;
}

export class CreateVehicleDto {
  @ApiProperty({ example: '12345/67', description: 'Digits, / and \\ only' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9/\\]+$/, { message: 'plate_number may only contain digits, / and \\' })
  plate_number: string;

  @ApiProperty({ description: 'Driver who owns this vehicle — required to attach registration, insurance, and car photos.' })
  @IsUUID()
  driver_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Deprecated — prefer ride_category_ids.',
  })
  @IsOptional()
  @IsUUID()
  ride_category_id?: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    description: 'One or more ride categories. Vehicle receives rides for any of these.',
  })
  @Transform(({ value, obj }) => mergeCategoryIds(value, obj?.ride_category_id))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ride_category_ids!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  year?: number;

  @ApiPropertyOptional({
    enum: [
      GoRideRequirementType.CHILD_SEAT,
      GoRideRequirementType.EXTRA_LUGGAGE,
      GoRideRequirementType.ACCESSIBILITY,
      GoRideRequirementType.PERSONAL_ASSISTANCE,
      GoRideRequirementType.WHEELCHAIR,
    ],
    isArray: true,
    description: 'Vehicle capabilities only — FEMALE_DRIVER is driver gender, not allowed here',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(GoRideRequirementType, { each: true })
  capabilities?: GoRideRequirementType[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  set_as_active?: boolean;

  @ApiProperty({
    type: [DriverDocumentInput],
    description: 'VEHICLE_REGISTRATION + INSURANCE documents (stored on the linked driver).',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentInput)
  documents!: DriverDocumentInput[];

  @ApiProperty({
    type: [String],
    minItems: 2,
    maxItems: 6,
    description: 'Car photos (2–6) stored on the linked driver profile.',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(32, { each: true })
  @MaxLength(5_500_000, { each: true })
  vehicle_photos!: string[];
}

export class UpdateVehicleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driver_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string | null;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Deprecated — prefer ride_category_ids.',
  })
  @IsOptional()
  @IsUUID()
  ride_category_id?: string | null;

  @ApiPropertyOptional({
    type: [String],
    minItems: 1,
    description: 'Replace the vehicle category set (at least one).',
  })
  @Transform(({ value, obj }) => {
    if (value === undefined && obj?.ride_category_id === undefined) return undefined;
    const merged = mergeCategoryIds(value, obj?.ride_category_id);
    return merged.length ? merged : undefined;
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ride_category_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    enum: [
      GoRideRequirementType.CHILD_SEAT,
      GoRideRequirementType.EXTRA_LUGGAGE,
      GoRideRequirementType.ACCESSIBILITY,
      GoRideRequirementType.PERSONAL_ASSISTANCE,
      GoRideRequirementType.WHEELCHAIR,
    ],
    isArray: true,
    description: 'Vehicle capabilities only — FEMALE_DRIVER is driver gender, not allowed here',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(GoRideRequirementType, { each: true })
  capabilities?: GoRideRequirementType[];
}

export class CreateCustomerDto {
  @ApiProperty({ example: '+963944444444' })
  @Matches(E164)
  phone: string;

  @ApiPropertyOptional({ example: 'New Customer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
