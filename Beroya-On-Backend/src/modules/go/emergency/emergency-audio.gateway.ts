import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import type { AppConfig } from '../../../config/configuration';
import { NAMESPACES } from '../../../infra/realtime/rooms';
import { AUDIO_TOKEN_PURPOSE } from './emergency.service';

/**
 * Signaling namespace for emergency audio (Ticket §15.2).
 * Auth via short-lived audio JWT (not the normal access token).
 */
@WebSocketGateway({ namespace: NAMESPACES.EMERGENCY_AUDIO })
export class EmergencyAudioGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EmergencyAudioGateway.name);
  private readonly secret: string;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<AppConfig>('app').jwt.accessSecret;
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        purpose: string;
        emergency_id: string;
      }>(token, { secret: this.secret });
      if (payload.purpose !== AUDIO_TOKEN_PURPOSE || !payload.emergency_id) {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      client.data.emergencyId = payload.emergency_id;
      await client.join(`emergency:${payload.emergency_id}`);
      client.emit('emergency.audio.ready', { emergency_id: payload.emergency_id });
    } catch (err) {
      this.logger.warn(`Emergency audio auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('emergency.audio.signal')
  signal(@ConnectedSocket() client: Socket, @MessageBody() body: { type?: string; sdp?: unknown }) {
    const emergencyId = client.data.emergencyId as string | undefined;
    if (!emergencyId) return { ok: false };
    client.to(`emergency:${emergencyId}`).emit('emergency.audio.signal', {
      from: client.data.userId,
      ...body,
    });
    return { ok: true };
  }
}
