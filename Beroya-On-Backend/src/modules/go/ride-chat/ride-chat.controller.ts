import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoChatSenderRole, GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import {
  ListRideMessagesQueryDto,
  MarkRideMessagesReadDto,
  RideMessageDto,
  RideMessageListDto,
  RideMessagesReadDto,
  SendRideMessageDto,
} from './dto/ride-chat.dto';
import { RideChatService } from './ride-chat.service';

const LIST_DESCRIPTION =
  'Oldest first. Pass after_id to get only newer messages. Readable in any ride status. ' +
  'Returns `{ items, unread_count }` — unread_count is for the chat badge (other party, read_at null).';
const SEND_DESCRIPTION =
  'Allowed from DRIVER_ASSIGNED through IN_PROGRESS only; otherwise 409 RIDE_NOT_ACTIVE. ' +
  'Idempotent on client_id (32 hex). Counterpart receives socket `ride.message` with the same message body ' +
  'on `/go/customer` or `/go/driver`, plus FCM when a push token is registered. ' +
  'VOICE: audio/mp4 (AAC .m4a). media_url needs Bearer via GET /media/chat/:file (ride parties only).';
const READ_DESCRIPTION =
  "Sets read_at on the other party's messages up to up_to_id. Counterpart receives `ride.messages_read` " +
  '{ ride_id, reader_role, up_to_id, read_at } when anything changed. Response includes unread_count for the badge.';

@ApiBearerAuth()
@Controller()
export class RideChatController {
  constructor(private readonly chat: RideChatService) {}

  // ---------- Customer ----------

  @Get('customer/rides/:rideId/messages')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Chat messages with the driver', description: LIST_DESCRIPTION })
  @ApiOkResponse({ type: RideMessageListDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RIDE_NOT_FOUND)
  customerList(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Query() q: ListRideMessagesQueryDto,
  ) {
    return this.chat.list(user.id, GoChatSenderRole.CUSTOMER, rideId, q);
  }

  @Post('customer/rides/:rideId/messages')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Send a text, image, or voice message to the driver', description: SEND_DESCRIPTION })
  @ApiOkResponse({ type: RideMessageDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE)
  customerSend(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SendRideMessageDto,
  ) {
    return this.chat.send(user.id, GoChatSenderRole.CUSTOMER, rideId, dto);
  }

  @Post('customer/rides/:rideId/messages/read')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: "Mark the driver's messages as read", description: READ_DESCRIPTION })
  @ApiOkResponse({ type: RideMessagesReadDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RIDE_NOT_FOUND)
  customerRead(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: MarkRideMessagesReadDto,
  ) {
    return this.chat.markRead(user.id, GoChatSenderRole.CUSTOMER, rideId, dto.up_to_id);
  }

  // ---------- Driver ----------

  @Get('driver/rides/:rideId/messages')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Chat messages with the customer', description: LIST_DESCRIPTION })
  @ApiOkResponse({ type: RideMessageListDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RIDE_NOT_FOUND)
  driverList(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Query() q: ListRideMessagesQueryDto,
  ) {
    return this.chat.list(user.id, GoChatSenderRole.DRIVER, rideId, q);
  }

  @Post('driver/rides/:rideId/messages')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Send a text, image, or voice message to the customer', description: SEND_DESCRIPTION })
  @ApiOkResponse({ type: RideMessageDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE)
  driverSend(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SendRideMessageDto,
  ) {
    return this.chat.send(user.id, GoChatSenderRole.DRIVER, rideId, dto);
  }

  @Post('driver/rides/:rideId/messages/read')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: "Mark the customer's messages as read", description: READ_DESCRIPTION })
  @ApiOkResponse({ type: RideMessagesReadDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RIDE_NOT_FOUND)
  driverRead(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: MarkRideMessagesReadDto,
  ) {
    return this.chat.markRead(user.id, GoChatSenderRole.DRIVER, rideId, dto.up_to_id);
  }

  // ---------- Media ----------

  @Get('media/chat/:file')
  @Roles(GoRole.CUSTOMER, GoRole.DRIVER)
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiTags('Customer', 'Driver')
  @ApiOperation({ summary: 'Chat image or voice file (use media_url); only the two parties of the ride' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  async media(@CurrentUser() user: AuthUser, @Param('file') file: string) {
    const media = await this.chat.readMedia(user, file);
    return new StreamableFile(media.data, { type: media.mime, disposition: 'inline' });
  }
}
