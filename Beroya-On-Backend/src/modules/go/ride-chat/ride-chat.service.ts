import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GoChatMessageType,
  GoChatSenderRole,
  GoRideMessage,
  GoRideStatus,
  GoRole,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import {
  CHAT_MEDIA_FILE,
  CHAT_MEDIA_MAX_BYTES,
  CHAT_VOICE_MAX_SEC,
  ChatMediaFile,
  ChatMediaStorage,
  decodeDataUrl,
  mp4DurationSec,
  sniffChatMedia,
} from './chat-media';
import { ListRideMessagesQueryDto, SendRideMessageDto } from './dto/ride-chat.dto';

const CHAT_OPEN_STATUSES: ReadonlySet<GoRideStatus> = new Set([
  GoRideStatus.DRIVER_ASSIGNED,
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
]);

/** Small tolerance for container rounding on a 60 s recording. */
const VOICE_DURATION_SLACK_SEC = 0.5;

type MessageContent = {
  text: string | null;
  media: { data: Buffer; file: ChatMediaFile } | null;
  duration_sec: number | null;
};

function fieldError(field: string, message: string) {
  return new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
    errors: [{ field, messages: [message] }],
  });
}

export function rideMessageView(m: GoRideMessage) {
  return {
    id: m.id,
    client_id: m.client_id,
    ride_id: m.ride_id,
    sender_role: m.sender_role,
    type: m.type,
    text: m.text,
    media_url: m.media_key ? `/api/v1/go/media/chat/${m.media_key}` : null,
    duration_sec: m.duration_sec,
    created_at: m.created_at,
    read_at: m.read_at,
  };
}

@Injectable()
export class RideChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly media: ChatMediaStorage,
  ) {}

  async list(userId: string, role: GoChatSenderRole, rideId: string, q: ListRideMessagesQueryDto) {
    await this.partyRide(userId, role, rideId);
    const afterSeq = q.after_id ? await this.seqOf(rideId, q.after_id, 'after_id') : undefined;
    const [rows, unread_count] = await Promise.all([
      this.prisma.goRideMessage.findMany({
        where: { ride_id: rideId, ...(afterSeq !== undefined ? { seq: { gt: afterSeq } } : {}) },
        orderBy: { seq: 'asc' },
        take: q.limit ?? 100,
      }),
      this.unreadCount(rideId, role),
    ]);
    return { items: rows.map(rideMessageView), unread_count };
  }

  async send(userId: string, role: GoChatSenderRole, rideId: string, dto: SendRideMessageDto) {
    const { ride, counterpartUserId } = await this.partyRide(userId, role, rideId);
    const replay = await this.findByClientId(rideId, role, dto.client_id);
    if (replay) return rideMessageView(replay);
    if (!CHAT_OPEN_STATUSES.has(ride.status)) {
      throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Chat is closed for this ride');
    }

    const content = this.content(dto);
    const id = randomUUID();
    const mediaKey = content.media ? `${id}.${content.media.file.ext}` : null;
    if (content.media && mediaKey) await this.media.save(mediaKey, content.media.data, content.media.file.mime);

    let message: GoRideMessage;
    try {
      message = await this.prisma.goRideMessage.create({
        data: {
          id,
          ride_id: rideId,
          client_id: dto.client_id,
          sender_role: role,
          sender_user_id: userId,
          type: dto.type,
          text: content.text,
          media_key: mediaKey,
          media_mime: content.media?.file.mime ?? null,
          duration_sec: content.duration_sec,
        },
      });
    } catch (e) {
      await this.media.remove(mediaKey);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const stored = await this.findByClientId(rideId, role, dto.client_id);
        if (stored) return rideMessageView(stored);
      }
      throw e;
    }

    const view = rideMessageView(message);
    // Counterpart gets the same message body on their socket (+ FCM via push catalog `ride.message`).
    if (counterpartUserId) this.emitTo(role, counterpartUserId, 'ride.message', view);
    return view;
  }

  async markRead(userId: string, role: GoChatSenderRole, rideId: string, upToId: string) {
    const { counterpartUserId } = await this.partyRide(userId, role, rideId);
    const upToSeq = await this.seqOf(rideId, upToId, 'up_to_id');
    const read_at = new Date();
    const { count } = await this.prisma.goRideMessage.updateMany({
      where: { ride_id: rideId, sender_role: { not: role }, seq: { lte: upToSeq }, read_at: null },
      data: { read_at },
    });
    const event = { ride_id: rideId, reader_role: role, up_to_id: upToId, read_at };
    if (count > 0 && counterpartUserId) this.emitTo(role, counterpartUserId, 'ride.messages_read', event);
    const unread_count = await this.unreadCount(rideId, role);
    return { ...event, updated: count, unread_count };
  }

  async readMedia(user: AuthUser, file: string) {
    if (!CHAT_MEDIA_FILE.test(file)) throw new GoException(GoErrorCode.NOT_FOUND, 'Media not found');
    const message = await this.prisma.goRideMessage.findUnique({
      where: { id: file.slice(0, 36) },
      select: {
        media_key: true,
        media_mime: true,
        ride: { select: { customer: { select: { user_id: true } }, driver: { select: { user_id: true } } } },
      },
    });
    const party =
      user.role === GoRole.CUSTOMER
        ? message?.ride.customer.user_id
        : user.role === GoRole.DRIVER
          ? message?.ride.driver?.user_id
          : undefined;
    if (!message || message.media_key !== file || party !== user.id) {
      throw new GoException(GoErrorCode.NOT_FOUND, 'Media not found');
    }
    const data = await this.media.read(file);
    if (!data) throw new GoException(GoErrorCode.NOT_FOUND, 'Media not found');
    return { data, mime: message.media_mime ?? 'application/octet-stream' };
  }

  /** A ride the caller is a party of; anyone else gets RIDE_NOT_FOUND. */
  private async partyRide(userId: string, role: GoChatSenderRole, rideId: string) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: {
        id: true,
        status: true,
        customer: { select: { user_id: true } },
        driver: { select: { user_id: true } },
      },
    });
    const customerUserId = ride?.customer.user_id ?? null;
    const driverUserId = ride?.driver?.user_id ?? null;
    const self = role === GoChatSenderRole.CUSTOMER ? customerUserId : driverUserId;
    if (!ride || self !== userId) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    return { ride, counterpartUserId: role === GoChatSenderRole.CUSTOMER ? driverUserId : customerUserId };
  }

  private async seqOf(rideId: string, messageId: string, field: string) {
    const row = await this.prisma.goRideMessage.findFirst({
      where: { id: messageId, ride_id: rideId },
      select: { seq: true },
    });
    if (!row) throw fieldError(field, `${field} is not a message of this ride`);
    return row.seq;
  }

  private findByClientId(rideId: string, role: GoChatSenderRole, clientId: string) {
    return this.prisma.goRideMessage.findUnique({
      where: { ride_id_sender_role_client_id: { ride_id: rideId, sender_role: role, client_id: clientId } },
    });
  }

  /** Unread messages from the other party (for chat badge). */
  private unreadCount(rideId: string, readerRole: GoChatSenderRole) {
    return this.prisma.goRideMessage.count({
      where: { ride_id: rideId, sender_role: { not: readerRole }, read_at: null },
    });
  }

  private emitTo(senderRole: GoChatSenderRole, recipientUserId: string, event: string, payload: unknown) {
    if (senderRole === GoChatSenderRole.CUSTOMER) this.realtime.emitToDriver(recipientUserId, event, payload);
    else this.realtime.emitToCustomer(recipientUserId, event, payload);
  }

  private content(dto: SendRideMessageDto): MessageContent {
    const text = dto.text || null;
    const dataUrl = dto.data_url || null;
    const duration = dto.duration_sec ?? null;

    if (dto.type === GoChatMessageType.TEXT) {
      if (!text) throw fieldError('text', 'text is required for TEXT messages');
      if (dataUrl) throw fieldError('data_url', 'data_url is only allowed for IMAGE and VOICE');
      if (duration !== null) throw fieldError('duration_sec', 'duration_sec is only allowed for VOICE');
      return { text, media: null, duration_sec: null };
    }

    if (text) throw fieldError('text', 'text must be empty for IMAGE and VOICE messages');
    if (!dataUrl) throw fieldError('data_url', `data_url is required for ${dto.type} messages`);
    const data = decodeDataUrl(dataUrl);
    if (!data.length) throw fieldError('data_url', 'data_url must be base64');
    if (data.length > CHAT_MEDIA_MAX_BYTES) throw fieldError('data_url', 'Media must be at most 5 MB');
    const file = sniffChatMedia(data, dto.type);

    if (dto.type === GoChatMessageType.IMAGE) {
      if (!file) throw fieldError('data_url', 'Image must be JPEG, PNG, WebP, or HEIC');
      if (duration !== null) throw fieldError('duration_sec', 'duration_sec is only allowed for VOICE');
      return { text: null, media: { data, file }, duration_sec: null };
    }

    if (!file) throw fieldError('data_url', 'Voice must be audio/mp4 (AAC .m4a)');
    const fromFile = mp4DurationSec(data);
    if (fromFile !== null && fromFile > CHAT_VOICE_MAX_SEC + VOICE_DURATION_SLACK_SEC) {
      throw fieldError('data_url', `Voice must be at most ${CHAT_VOICE_MAX_SEC} seconds`);
    }
    const seconds = fromFile !== null ? Math.min(CHAT_VOICE_MAX_SEC, Math.max(1, Math.round(fromFile))) : duration;
    if (seconds === null) throw fieldError('duration_sec', 'duration_sec is required for VOICE messages');
    return { text: null, media: { data, file }, duration_sec: seconds };
  }
}
