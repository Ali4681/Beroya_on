import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoEmergencyStatus, GoRole } from '@/generated/prisma/client';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { EmergencyService } from './emergency.service';

class StartEmergencyDto {
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

class EmergencyLocationDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

class AudioChunkDto {
  @ApiProperty({ description: 'Base64-encoded audio chunk (temp until save/discard)' })
  @IsString()
  @MinLength(1)
  @MaxLength(400_000)
  data_base64!: string;
}

class EmergenciesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoEmergencyStatus })
  @IsOptional()
  @IsIn(Object.values(GoEmergencyStatus))
  status?: GoEmergencyStatus;
}

@ApiBearerAuth()
@Controller()
export class EmergencyController {
  constructor(private readonly emergency: EmergencyService) {}

  @Post('customer/rides/:rideId/emergency')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Start emergency session (Ticket §15.1) — DRIVER_ASSIGNED through IN_PROGRESS',
    description:
      '201 + already_active=false when a new session opens and customer service is alerted. ' +
      'If the ride already has an open session (even after the ride ended) it is returned with 200 + already_active=true ' +
      'and nobody is alerted again; lat/lng then update its last location. ' +
      'status is ACTIVE until customer service closes it; claimed / claimed_at show it was picked up. ' +
      '`started_by` is CUSTOMER | DRIVER. Assigned driver also receives `emergency.started` on /go/driver.',
  })
  @ApiGoErrors(E.VALIDATION_ERROR, E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE)
  async start(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: StartEmergencyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.emergency.startByCustomer(user.id, rideId, dto);
    res.status(session.already_active ? HttpStatus.OK : HttpStatus.CREATED);
    return session;
  }

  @Post('customer/rides/:rideId/emergency/:emergencyId/location')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Customer position while the emergency is open (send every ~10 s)',
    description: 'Customer service receives `emergency.location`. EMERGENCY_NOT_ACTIVE once the session is closed.',
  })
  @ApiGoErrors(E.VALIDATION_ERROR, E.NOT_FOUND, E.EMERGENCY_NOT_ACTIVE)
  location(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Param('emergencyId', ParseUUIDPipe) emergencyId: string,
    @Body() dto: EmergencyLocationDto,
  ) {
    return this.emergency.updateCustomerLocation(user.id, rideId, emergencyId, dto.lat, dto.lng);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/emergency')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver SOS — open / resume shared emergency session (EMRG-001)',
    description:
      'Same GoEmergencySession as customer SOS (one open per ride). ' +
      '201 + already_active=false on new session (CS alert + started_by=DRIVER). ' +
      '200 + already_active=true if already open (no second alert; lat/lng updates last location). ' +
      'Requires Idempotency-Key. Audio upload is customer-only in v1. Staff closes the session.',
  })
  @ApiGoErrors(
    E.VALIDATION_ERROR,
    E.RIDE_NOT_FOUND,
    E.RIDE_NOT_ACTIVE,
    E.ACCOUNT_NOT_FOUND,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  async startByDriver(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: StartEmergencyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.emergency.startByDriver(user.id, rideId, dto);
    res.status(session.already_active ? HttpStatus.OK : HttpStatus.CREATED);
    return session;
  }

  @Post('driver/rides/:rideId/emergency/:emergencyId/location')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver position while SOS is open (every ~10 s)',
    description: 'Staff receive `emergency.location`. EMERGENCY_NOT_ACTIVE once closed.',
  })
  @ApiGoErrors(E.VALIDATION_ERROR, E.RIDE_NOT_FOUND, E.EMERGENCY_NOT_ACTIVE, E.ACCOUNT_NOT_FOUND)
  locationByDriver(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Param('emergencyId', ParseUUIDPipe) emergencyId: string,
    @Body() dto: EmergencyLocationDto,
  ) {
    return this.emergency.updateDriverLocation(user.id, rideId, emergencyId, dto.lat, dto.lng);
  }

  @Post('customer/emergencies/:emergencyId/audio/token')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Short-lived emergency audio token (Ticket §15.2)' })
  @ApiGoErrors(E.NOT_FOUND, E.EMERGENCY_NOT_ACTIVE)
  audioToken(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.issueAudioToken(user.id, emergencyId);
  }

  @Post('customer/emergencies/:emergencyId/audio/chunk')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Upload temp audio chunk (WebRTC/transport fallback)' })
  chunk(
    @CurrentUser() user: AuthUser,
    @Param('emergencyId', ParseUUIDPipe) emergencyId: string,
    @Body() dto: AudioChunkDto,
  ) {
    return this.emergency.appendAudioChunk(user.id, emergencyId, dto.data_base64);
  }

  @Post('customer/emergencies/:emergencyId/audio/stop')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  stopCustomer(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.stopAudioByCustomer(user.id, emergencyId);
  }

  @Post('erp/emergencies/:emergencyId/audio/stop')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  stopStaff(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.stopAudioByStaff(user, emergencyId);
  }

  @Post('erp/emergencies/:emergencyId/recording/save')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Save recording permanently (Ticket §15.5)' })
  save(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.saveRecording(user, emergencyId);
  }

  @Post('erp/emergencies/:emergencyId/recording/discard')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  discard(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.discardRecording(user, emergencyId);
  }

  @Get('erp/emergencies/:emergencyId/recording')
  @Roles(GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Playback metadata + signed stream URL — supervisor only (Ticket §15.7)' })
  @ApiGoErrors(E.RECORDING_NOT_SAVED, E.ROLE_NOT_ALLOWED)
  playback(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.getRecording(user, emergencyId);
  }

  @Public()
  @Get('erp/emergencies/:emergencyId/recording/stream')
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Binary stream via signed token (Ticket §15.7)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.RECORDING_NOT_SAVED)
  async stream(
    @Param('emergencyId', ParseUUIDPipe) emergencyId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED).json({ code: E.UNAUTHORIZED, message: 'token required' });
      return;
    }
    const data = await this.emergency.streamRecording(emergencyId, token);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(data.length));
    res.send(data);
  }

  @Delete('erp/emergencies/:emergencyId/recording')
  @Roles(GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Delete saved recording — supervisor only + audit (Ticket §15.8)' })
  deleteRecording(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.deleteRecording(user, emergencyId);
  }

  @Get('erp/emergencies/:emergencyId')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'One emergency session' })
  get(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.get(user, emergencyId);
  }

  @Post('erp/emergencies/:emergencyId/audio/token')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Short-lived token to join the live emergency audio room' })
  staffAudioToken(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.issueStaffAudioToken(user, emergencyId);
  }

  @Get('erp/emergencies')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  list(@CurrentUser() user: AuthUser, @Query() q: EmergenciesQueryDto) {
    return this.emergency.list(user, q);
  }

  @Post('erp/emergencies/:emergencyId/claim')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  claim(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.claim(user, emergencyId);
  }

  @Post('erp/emergencies/:emergencyId/close')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  close(@CurrentUser() user: AuthUser, @Param('emergencyId', ParseUUIDPipe) emergencyId: string) {
    return this.emergency.close(user, emergencyId);
  }
}
