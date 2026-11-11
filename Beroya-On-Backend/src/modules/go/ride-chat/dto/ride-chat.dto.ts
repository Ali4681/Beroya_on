import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoChatMessageType, GoChatSenderRole } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { CHAT_MEDIA_MAX_BYTES, CHAT_VOICE_MAX_SEC } from '../chat-media';

/** 5 MB of base64 plus room for a `data:` prefix. */
const MAX_DATA_URL_CHARS = Math.ceil(CHAT_MEDIA_MAX_BYTES / 3) * 4 + 100;

export class ListRideMessagesQueryDto {
  @ApiPropertyOptional({ description: 'Only messages sent after this message id' })
  @IsOptional()
  @IsUUID()
  after_id?: string;

  @ApiPropertyOptional({ example: 100, default: 100, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;
}

export class SendRideMessageDto {
  @ApiProperty({
    example: '9f2c4e1a7b3d4c5e8f9a0b1c2d3e4f5a',
    description: '32 hex chars made by the sender. Resending the same client_id returns the stored message.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[0-9a-f]{32}$/, { message: 'client_id must be 32 hex characters' })
  client_id!: string;

  @ApiProperty({ enum: GoChatMessageType })
  @IsEnum(GoChatMessageType)
  type!: GoChatMessageType;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Required for TEXT; must be empty for IMAGE / VOICE' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  text?: string | null;

  @ApiPropertyOptional({
    description:
      'Required for IMAGE / VOICE: base64, `data:` prefix optional, max 5 MB. ' +
      'IMAGE: JPEG, PNG, WebP, HEIC. VOICE: audio/mp4 (AAC .m4a), max 60 s.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DATA_URL_CHARS, { message: 'data_url must be at most 5 MB' })
  data_url?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: CHAT_VOICE_MAX_SEC,
    description: 'VOICE only. The duration read from the file wins when the file has one.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(CHAT_VOICE_MAX_SEC)
  duration_sec?: number | null;
}

export class MarkRideMessagesReadDto {
  @ApiProperty({ description: "Marks the other party's messages up to and including this one as read" })
  @IsUUID()
  up_to_id!: string;
}

export class RideMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() client_id!: string;
  @ApiProperty() ride_id!: string;
  @ApiProperty({ enum: GoChatSenderRole }) sender_role!: GoChatSenderRole;
  @ApiProperty({ enum: GoChatMessageType }) type!: GoChatMessageType;
  @ApiProperty({ nullable: true, type: String }) text!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: '/api/v1/go/media/chat/5b1f0c2e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.m4a',
    description: 'Relative; send the Bearer token. Only the two parties of the ride can load it.',
  })
  media_url!: string | null;
  @ApiProperty({ nullable: true, type: Number }) duration_sec!: number | null;
  @ApiProperty() created_at!: Date;
  @ApiProperty({ nullable: true, type: Date }) read_at!: Date | null;
}

export class RideMessageListDto {
  @ApiProperty({ type: [RideMessageDto] }) items!: RideMessageDto[];

  @ApiProperty({
    example: 2,
    description: "Unread count of the other party's messages (chat badge). Not affected by after_id pagination.",
  })
  unread_count!: number;
}

export class RideMessagesReadDto {
  @ApiProperty() ride_id!: string;
  @ApiProperty({ enum: GoChatSenderRole }) reader_role!: GoChatSenderRole;
  @ApiProperty() up_to_id!: string;
  @ApiProperty() read_at!: Date;
  @ApiProperty({ description: 'How many messages changed to read by this call' }) updated!: number;

  @ApiProperty({ example: 0, description: 'Remaining unread for the reader after this mark-read' })
  unread_count!: number;
}
