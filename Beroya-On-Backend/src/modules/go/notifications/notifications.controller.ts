import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoDevicePlatform, GoNotificationBroadcastStatus, GoRole } from '@/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { STAFF_ROLES } from '../../../common/auth/roles';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { AuditService } from '../audit/audit.service';
import {
  BROADCAST_AUDIENCES,
  BROADCAST_FILTERS,
  type BroadcastAudience,
  type BroadcastFilter,
  MAX_AUDIENCE_LIMIT,
  NotificationsService,
} from './notifications.service';

class BroadcastDto {
  @ApiProperty({ enum: BROADCAST_AUDIENCES })
  @IsIn(BROADCAST_AUDIENCES)
  audience!: BroadcastAudience;

  @ApiPropertyOptional({
    enum: BROADCAST_FILTERS,
    description:
      'Optional segment: customer/driver birthday today, top/bottom orders, top points, top-rated drivers',
  })
  @IsOptional()
  @IsIn(BROADCAST_FILTERS)
  filter?: BroadcastFilter;

  @ApiPropertyOptional({
    description: 'How many people for ranked filters (default 10, max 100). Ignored for birthday unless set.',
    minimum: 1,
    maximum: MAX_AUDIENCE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIENCE_LIMIT)
  limit?: number;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(280)
  body!: string;
}

class ScheduleBroadcastDto extends BroadcastDto {
  @ApiProperty({ description: 'ISO-8601 time when the broadcast should send' })
  @IsDateString()
  scheduled_at!: string;
}

class AudiencePreviewQueryDto {
  @ApiProperty({ enum: BROADCAST_FILTERS })
  @IsIn(BROADCAST_FILTERS)
  filter!: BroadcastFilter;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_AUDIENCE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIENCE_LIMIT)
  limit?: number;
}

class UpdateBirthdayTemplatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customer_birthday_title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(280)
  customer_birthday_body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  driver_birthday_title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(280)
  driver_birthday_body?: string;
}

class BroadcastListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoNotificationBroadcastStatus })
  @IsOptional()
  @IsIn(Object.values(GoNotificationBroadcastStatus))
  status?: GoNotificationBroadcastStatus;

  @ApiPropertyOptional({ enum: BROADCAST_AUDIENCES })
  @IsOptional()
  @IsIn(BROADCAST_AUDIENCES)
  audience?: BroadcastAudience;
}

class PushTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: GoDevicePlatform })
  @IsIn(Object.values(GoDevicePlatform))
  platform!: GoDevicePlatform;
}

class MarkNotificationsReadDto {
  @ApiProperty({ description: 'Mark this notification and all older ones as read' })
  @IsUUID()
  up_to_id!: string;
}

@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Get('customer/notifications')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Customer notification inbox',
    description: 'Returns { items, unread_count }. Use unread_count for the red badge on Account → Notifications.',
  })
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.notifications.listForCustomer(user.id, q);
  }

  @Post('customer/notifications/read')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Mark notifications as read up to (and including) up_to_id' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR)
  markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkNotificationsReadDto) {
    return this.notifications.markReadUpTo(user.id, dto.up_to_id);
  }

  @Get('driver/notifications')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver notification inbox (home menu «الإشعارات»)',
    description:
      'Returns { items, unread_count, page, limit, total, has_more }. ' +
      'Each item has id, title, body, created_at, read_at, type (=event), data (=payload), ' +
      'and `category`: WALLET | RIDE | RATING | WARNING | SYSTEM (fixed icon — do not parse title). ' +
      'Socket `notification.created` uses the same item shape.',
  })
  listDriver(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.notifications.listForDriver(user.id, q);
  }

  @Post('driver/notifications/read')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Mark driver notifications as read up to (and including) up_to_id' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR)
  markDriverRead(@CurrentUser() user: AuthUser, @Body() dto: MarkNotificationsReadDto) {
    return this.notifications.markDriverReadUpTo(user.id, dto.up_to_id);
  }

  @Get('admin/notifications')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'List admin broadcasts (history + scheduled)' })
  listBroadcasts(@Query() q: BroadcastListQueryDto) {
    return this.notifications.listBroadcasts(q);
  }

  @Get('admin/notifications/audience-preview')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Preview who a filter would reach (names + metric) before sending',
  })
  @ApiGoErrors(E.VALIDATION_ERROR)
  previewAudience(@Query() q: AudiencePreviewQueryDto) {
    return this.notifications.previewAudience(q.filter, q.limit);
  }

  @Get('admin/notifications/birthdays-today')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Customers and drivers whose registered birthday is today (dashboard banner)',
  })
  birthdaysToday() {
    return this.notifications.birthdaysToday();
  }

  @Get('admin/notifications/templates')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Default birthday notification copy (editable)' })
  getTemplates() {
    return this.notifications.getNotificationConfig();
  }

  @Patch('admin/notifications/templates')
  @Idempotent()
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update default birthday notification copy' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  async updateTemplates(@CurrentUser() user: AuthUser, @Body() dto: UpdateBirthdayTemplatesDto) {
    const item = await this.notifications.updateBirthdayTemplates(dto);
    await this.audit.log({
      actor: user,
      action: 'notification.templates.update',
      entity_type: 'notification_config',
      entity_id: 'default',
      metadata: { ...dto },
    });
    return item;
  }

  @Get('admin/notifications/:id')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Broadcast detail' })
  @ApiGoErrors(E.NOT_FOUND)
  getBroadcast(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.getBroadcast(id);
  }

  @Post('admin/notifications')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Send a message to everyone, drivers, customers, or staff (optional filter + limit)',
  })
  @ApiGoErrors(E.VALIDATION_ERROR)
  async broadcast(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    const result = await this.notifications.createImmediateBroadcast(
      user,
      dto.audience,
      title,
      body,
      dto.filter,
      dto.limit,
    );
    await this.audit.log({
      actor: user,
      action: 'notification.broadcast',
      entity_type: 'notification_broadcast',
      entity_id: result.item.id,
      metadata: {
        audience: dto.audience,
        filter: dto.filter ?? null,
        limit: dto.limit ?? null,
        title,
        devices: result.devices,
        inbox: result.inbox_count,
        recipients: result.recipients,
      },
    });
    return {
      audience: dto.audience,
      filter: dto.filter ?? null,
      limit: dto.limit ?? null,
      title,
      devices: result.devices,
      inbox_count: result.inbox_count,
      recipients: result.recipients,
      broadcast: result.item,
    };
  }

  @Post('admin/notifications/schedule')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Schedule a broadcast for later (optional filter + limit)' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.SERVICE_UNAVAILABLE)
  async schedule(@CurrentUser() user: AuthUser, @Body() dto: ScheduleBroadcastDto) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    const item = await this.notifications.scheduleBroadcast(
      user,
      dto.audience,
      title,
      body,
      dto.scheduled_at,
      dto.filter,
      dto.limit,
    );
    await this.audit.log({
      actor: user,
      action: 'notification.schedule',
      entity_type: 'notification_broadcast',
      entity_id: item.id,
      metadata: {
        audience: dto.audience,
        filter: dto.filter ?? null,
        limit: dto.limit ?? null,
        title,
        scheduled_at: item.scheduled_at,
      },
    });
    return item;
  }

  @Delete('admin/notifications/:id')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Cancel a scheduled broadcast' })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT)
  async cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.notifications.cancelBroadcast(id);
    await this.audit.log({
      actor: user,
      action: 'notification.cancel',
      entity_type: 'notification_broadcast',
      entity_id: item.id,
      metadata: { audience: item.audience, title: item.title },
    });
    return item;
  }

  @Post('customer/push-token')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Register this device for customer push notifications' })
  registerCustomer(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.notifications.register(user.id, dto.token, dto.platform);
  }

  @Delete('customer/push-token')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  unregisterCustomer(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.notifications.unregister(user.id, dto.token);
  }

  @Post('driver/push-token')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Register this device for driver push notifications' })
  registerDriver(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.notifications.register(user.id, dto.token, dto.platform);
  }

  @Delete('driver/push-token')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  unregisterDriver(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.notifications.unregister(user.id, dto.token);
  }
}
