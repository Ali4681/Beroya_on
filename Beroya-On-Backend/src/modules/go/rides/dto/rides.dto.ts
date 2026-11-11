import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GoBookingFor,
  GoPaymentMethod,
  GoRideRequirementType,
  GoRideStatus,
  GoRideType,
  GoServiceCode,
} from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { E164, E164_MSG, normalizeE164 } from '../../auth/phone';
import { normalizeLanguageCode, WORLD_LANGUAGE_CODES } from '../../drivers/world-languages';
import { MAX_VEHICLES_PER_RIDE } from '../ride-service-booking';

/** How the customer chose the map point (Ticket §14 — distinguish pin vs GPS). */
export const PICKUP_SOURCES = ['PIN', 'GPS', 'SEARCH', 'SAVED_PLACE'] as const;
export type PickupSource = (typeof PICKUP_SOURCES)[number];

export class LatLngDto {
  @ApiProperty({ example: 33.5138 })
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 36.2765 })
  @Type(() => Number)
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 'شارع بغداد' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class UpdatePickupDto extends LatLngDto {
  @ApiPropertyOptional({
    enum: PICKUP_SOURCES,
    description: 'PIN = map pin, GPS = device location shared as pickup, SEARCH = geocode, SAVED_PLACE = saved address',
  })
  @IsOptional()
  @IsIn([...PICKUP_SOURCES])
  source?: PickupSource;
}

/** Driver «تعطّل السيارة» subtypes — ACCIDENT maps to case ACCIDENT; others to BREAKDOWN. */
export const BREAKDOWN_SUBTYPES = ['ENGINE', 'TIRE', 'FUEL', 'ACCIDENT', 'OTHER'] as const;
export type BreakdownSubtype = (typeof BREAKDOWN_SUBTYPES)[number];

export class DriverBreakdownDto {
  @ApiProperty({ enum: BREAKDOWN_SUBTYPES, example: 'ENGINE' })
  @IsIn([...BREAKDOWN_SUBTYPES])
  subtype!: BreakdownSubtype;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'Breakdown GPS (defaults to last known driver location)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

export class FleetVehicleLineDto {
  @ApiProperty()
  @IsUUID()
  ride_category_id: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VEHICLES_PER_RIDE)
  count: number;
}

export class EstimateRideDto {
  @ApiProperty()
  @IsUUID()
  ride_category_id: string;

  @ApiProperty({ enum: GoRideType, enumName: 'GoRideType', example: GoRideType.IMMEDIATE })
  @IsEnum(GoRideType)
  ride_type: GoRideType;

  @ApiPropertyOptional({
    enum: GoServiceCode,
    enumName: 'GoServiceCode',
    default: GoServiceCode.DAILY,
    description: 'DAILY (default), TOURIST, FLEET, RENTAL, INTERCITY, ACCESSIBILITY, or AMBULANCE.',
  })
  @IsOptional()
  @IsEnum(GoServiceCode)
  service_type?: GoServiceCode;

  @ApiPropertyOptional({
    example: 4,
    description:
      'Required for TOURIST (≥1; no vehicle-capacity cap). Optional for DAILY/INTERCITY/ACCESSIBILITY/AMBULANCE (capped by category.max_passengers).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengers_count?: number;

  @ApiPropertyOptional({
    example: 2,
    default: 1,
    description: 'TOURIST / FLEET vehicle count. DAILY/INTERCITY/ACCESSIBILITY/AMBULANCE must be 1. FLEET: 1…20.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VEHICLES_PER_RIDE)
  vehicles_count?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'FLEET only: random category mix (reference fare × vehicles_count).',
  })
  @IsOptional()
  @IsBoolean()
  random_vehicles?: boolean;

  @ApiPropertyOptional({
    type: [FleetVehicleLineDto],
    description: 'FLEET only when random_vehicles=false. Sum of count must equal vehicles_count. No TAXI.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FleetVehicleLineDto)
  vehicles?: FleetVehicleLineDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  scheduled_at?: string | null;

  @ApiPropertyOptional({
    description: 'RENTAL end time (ISO). Alternative: duration_hours.',
  })
  @IsOptional()
  @IsDateString()
  ends_at?: string | null;

  @ApiPropertyOptional({
    example: 2,
    description: 'RENTAL: hours > 0. Server sets ends_at = scheduled_at + duration when ends_at omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  duration_hours?: number;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  pickup: LatLngDto;

  @ApiPropertyOptional({
    type: LatLngDto,
    description:
      'Required for DAILY/TOURIST/FLEET/INTERCITY/ACCESSIBILITY/AMBULANCE. Omit for RENTAL (pickup-only chauffeur hire).',
  })
  @ValidateIf((o: EstimateRideDto) => o.service_type !== GoServiceCode.RENTAL)
  @ValidateNested()
  @Type(() => LatLngDto)
  destination?: LatLngDto;

  @ApiPropertyOptional({
    description: 'INTERCITY: city id from GET /customer/cities (pickup governorate). Must differ from destination_city_id.',
  })
  @IsOptional()
  @IsUUID()
  pickup_city_id?: string;

  @ApiPropertyOptional({
    description: 'INTERCITY: city id from GET /customer/cities (destination governorate). Must differ from pickup_city_id.',
  })
  @IsOptional()
  @IsUUID()
  destination_city_id?: string;

  @ApiPropertyOptional({ type: [LatLngDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LatLngDto)
  stops?: LatLngDto[];

  @ApiPropertyOptional({ enum: GoRideRequirementType, isArray: true, enumName: 'GoRideRequirementType' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(GoRideRequirementType, { each: true })
  requirements?: GoRideRequirementType[];

  @ApiPropertyOptional({
    example: 'en',
    default: 'ar',
    description:
      'ISO 639-1 language the customer wants the driver to speak. Required for VIP category and TOURIST service (hard filter). Soft preference otherwise.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeLanguageCode(value) : value))
  @IsIn(WORLD_LANGUAGE_CODES)
  preferred_driver_language?: string;

  @ApiPropertyOptional({
    example: 'WELCOME10',
    description:
      'Typed discount code (public or personal). When valid, each route gets discount_amount and final_fare; when not, the estimate fails with the DISCOUNT_CODE_* error.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  discount_code?: string;
}

export class SelectedRouteDto {
  @ApiProperty({ description: 'Id returned by POST /customer/rides/estimate' })
  @IsString()
  @MaxLength(32)
  route_id: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  distance_m: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_sec: number;

  @ApiProperty({ description: 'Google encoded polyline' })
  @IsString()
  encoded_polyline: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  summary?: string;
}

export class OtherPassengerDto {
  @ApiPropertyOptional({ nullable: true, description: 'Required when booking_for = OTHER.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+963912345678', description: 'Optional. Never shown to the driver.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? null : normalizeE164(value)))
  @Matches(E164, { message: E164_MSG })
  phone?: string | null;
}

export class CreateRideDto {
  @ApiProperty()
  @IsUUID()
  ride_category_id: string;

  @ApiProperty({ enum: GoRideType, enumName: 'GoRideType' })
  @IsEnum(GoRideType)
  type: GoRideType;

  @ApiPropertyOptional({
    enum: GoServiceCode,
    enumName: 'GoServiceCode',
    default: GoServiceCode.DAILY,
    description: 'DAILY (default), TOURIST, FLEET, RENTAL, INTERCITY, ACCESSIBILITY, or AMBULANCE.',
  })
  @IsOptional()
  @IsEnum(GoServiceCode)
  service_type?: GoServiceCode;

  @ApiPropertyOptional({
    example: 4,
    description: 'Required for TOURIST (≥1; no vehicle-capacity cap). Optional for DAILY/INTERCITY/ACCESSIBILITY/AMBULANCE.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengers_count?: number;

  @ApiPropertyOptional({
    example: 2,
    default: 1,
    description: 'TOURIST / FLEET vehicle count. DAILY/INTERCITY/ACCESSIBILITY/AMBULANCE must be 1. FLEET: 1…20.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VEHICLES_PER_RIDE)
  vehicles_count?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'FLEET only: random category mix.',
  })
  @IsOptional()
  @IsBoolean()
  random_vehicles?: boolean;

  @ApiPropertyOptional({
    type: [FleetVehicleLineDto],
    description: 'FLEET only when random_vehicles=false. Sum of count = vehicles_count. No TAXI.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FleetVehicleLineDto)
  vehicles?: FleetVehicleLineDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  scheduled_at?: string | null;

  @ApiPropertyOptional({
    description: 'RENTAL end time (ISO). Alternative: duration_hours.',
  })
  @IsOptional()
  @IsDateString()
  ends_at?: string | null;

  @ApiPropertyOptional({
    example: 2,
    description: 'RENTAL: hours > 0 when ends_at omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  duration_hours?: number;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  pickup: LatLngDto;

  @ApiPropertyOptional({
    enum: PICKUP_SOURCES,
    description: 'How the customer set pickup (PIN / GPS / SEARCH / SAVED_PLACE). Stored for disputes; does not change pricing.',
  })
  @IsOptional()
  @IsIn([...PICKUP_SOURCES])
  pickup_source?: PickupSource;

  @ApiPropertyOptional({
    type: LatLngDto,
    description: 'Required for DAILY/TOURIST/FLEET/INTERCITY/ACCESSIBILITY/AMBULANCE. Omit for RENTAL.',
  })
  @ValidateIf((o: CreateRideDto) => o.service_type !== GoServiceCode.RENTAL)
  @ValidateNested()
  @Type(() => LatLngDto)
  destination?: LatLngDto;

  @ApiPropertyOptional({
    description: 'INTERCITY: city id from GET /customer/cities (pickup). Must differ from destination_city_id.',
  })
  @IsOptional()
  @IsUUID()
  pickup_city_id?: string;

  @ApiPropertyOptional({
    description: 'INTERCITY: city id from GET /customer/cities (destination). Must differ from pickup_city_id.',
  })
  @IsOptional()
  @IsUUID()
  destination_city_id?: string;

  @ApiPropertyOptional({ type: [LatLngDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LatLngDto)
  stops?: LatLngDto[];

  @ApiPropertyOptional({ enum: GoRideRequirementType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(GoRideRequirementType, { each: true })
  requirements?: GoRideRequirementType[];

  @ApiPropertyOptional({ enum: GoBookingFor, enumName: 'GoBookingFor', default: GoBookingFor.SELF })
  @IsOptional()
  @IsEnum(GoBookingFor)
  booking_for?: GoBookingFor;

  @ApiPropertyOptional({ type: OtherPassengerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OtherPassengerDto)
  other_passenger?: OtherPassengerDto;

  @ApiPropertyOptional({
    example: 'en',
    default: 'ar',
    description:
      'ISO 639-1 language the customer wants the driver to speak. Required for VIP category and TOURIST service — only matching drivers are offered. Soft preference otherwise.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeLanguageCode(value) : value))
  @IsIn(WORLD_LANGUAGE_CODES)
  preferred_driver_language?: string;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 150,
    example: 'أنا عند البوابة الشرقية',
    description: 'Note shown to the driver in the offer and ride details.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customer_note?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 60,
    example: 'أحمد محمد',
    description: 'Name on the pickup sign. Only with booking_for OTHER; shown to the driver in the offer and ride.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(60)
  pickup_sign_name?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'Creates a public driver-tracking link (tracking_url on the ride once a driver is assigned) for the customer to share.',
  })
  @IsOptional()
  @IsBoolean()
  share_tracking_link?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Discount codes — Phase 16; must be null in Phase 2' })
  @IsOptional()
  @IsUUID()
  discount_code_id?: string | null;

  @ApiPropertyOptional({
    enum: GoPaymentMethod,
    enumName: 'GoPaymentMethod',
    default: GoPaymentMethod.CASH,
    description: 'CASH or WALLET. SHAM_CASH is rejected in V1.',
  })
  @IsOptional()
  @IsEnum(GoPaymentMethod)
  payment_method?: GoPaymentMethod;

  @ApiPropertyOptional({
    type: SelectedRouteDto,
    description: 'Route the customer picked from estimate.routes. Omit to use the first alternative.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedRouteDto)
  selected_route?: SelectedRouteDto;
}

export enum RideHistoryScope {
  CURRENT = 'current',
  PAST = 'past',
}

export class RideHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RideHistoryScope,
    description: 'current = not finished yet (live + scheduled, soonest first); past = finished, newest first',
  })
  @IsOptional()
  @IsEnum(RideHistoryScope)
  scope?: RideHistoryScope;

  @ApiPropertyOptional({
    enum: GoRideStatus,
    enumName: 'GoRideStatus',
    isArray: true,
    description: 'One or more: status=A&status=B or status=A,B. Combined with scope as an intersection.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(',')).map((v) => v.trim()).filter(Boolean),
  )
  @IsEnum(GoRideStatus, { each: true })
  status?: GoRideStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AddStopDto extends LatLngDto {
  @ApiPropertyOptional({ example: 1, description: '1-based insert position among intermediate stops' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  position?: number;
}

export class UpdateRideNoteDto {
  @ApiProperty({ nullable: true, maxLength: 150, description: 'null or empty string clears the note' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customer_note: string | null;
}

export class ReorderStopsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  stop_ids: string[];
}

export class AssignDriverDto {
  @ApiProperty({ description: 'GoDriverProfile id' })
  @IsUUID()
  driver_id: string;
}

export class EndRideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

/** Driver returns cash change to the customer wallet after collecting cash. */
export class ReturnChangeDto {
  @ApiProperty({
    example: 10000,
    description:
      'Cash the customer handed the driver (ل.س). Change = cash_received − cash_due; must be > 0. ' +
      'cash_due = max(0, customer_payable − wallet_paid_amount).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  cash_received!: number;
}

export class DriverCancelRideDto {
  @ApiPropertyOptional({ example: 'EMERGENCY' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reason_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason_text?: string;
}

export class StaffCancelRideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'STAFF_CANCEL' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reason_code?: string;

  @ApiPropertyOptional({ description: 'Apply LATE_CANCELLATION passport hit to customer' })
  @IsOptional()
  @IsBoolean()
  penalize_customer?: boolean;

  @ApiPropertyOptional({ description: 'Apply DRIVER_CANCELLED_RIDE score to driver' })
  @IsOptional()
  @IsBoolean()
  penalize_driver?: boolean;

  @ApiPropertyOptional({
    description: 'When penalize_driver, also debit driver wallet (default true if penalize_driver)',
  })
  @IsOptional()
  @IsBoolean()
  wallet_penalty?: boolean;
}

export class DriverLocationDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lng: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  recorded_at?: string;
}

/** Batch offline sync — recorded_at required (Ticket §6.5). */
export class DriverLocationBatchPointDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lng: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;

  @ApiProperty({ description: 'ISO timestamp when the point was recorded on device' })
  @IsDateString()
  recorded_at: string;
}

export class DriverLocationBatchDto {
  @ApiProperty({ type: [DriverLocationBatchPointDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverLocationBatchPointDto)
  points: DriverLocationBatchPointDto[];
}
