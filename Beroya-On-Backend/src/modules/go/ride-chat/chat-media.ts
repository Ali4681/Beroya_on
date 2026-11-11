import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';

export const CHAT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_VOICE_MAX_SEC = 60;

export type ChatMediaKind = 'IMAGE' | 'VOICE';
export type ChatMediaFile = { ext: 'jpg' | 'png' | 'webp' | 'heic' | 'm4a'; mime: string };

/** `<message uuid>.<ext>`; anything else is never a stored chat file. */
export const CHAT_MEDIA_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|m4a)$/;

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

@Injectable()
export class ChatMediaStorage {
  private readonly folder = 'chat-media';

  constructor(private readonly objects: ObjectStorageService) {}

  async save(file: string, data: Buffer, mime?: string) {
    if (!CHAT_MEDIA_FILE.test(file)) throw new Error(`Invalid chat media file ${file}`);
    await this.objects.put('private', `${this.folder}/${file}`, data, mime);
  }

  async read(file: string) {
    if (!CHAT_MEDIA_FILE.test(file)) throw new Error(`Invalid chat media file ${file}`);
    return this.objects.get('private', `${this.folder}/${file}`);
  }

  async remove(file: string | null | undefined) {
    if (!file) return;
    if (!CHAT_MEDIA_FILE.test(file)) throw new Error(`Invalid chat media file ${file}`);
    await this.objects.remove('private', `${this.folder}/${file}`);
  }
}

/** Strips an optional `data:<mime>;base64,` prefix. Empty buffer when the payload is not base64. */
export function decodeDataUrl(raw: string) {
  const body = raw.replace(/^data:[a-z0-9.+/-]*(;[a-z0-9=.+-]+)*;base64,/i, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(body)) return Buffer.alloc(0);
  return Buffer.from(body, 'base64');
}

/** Detects the real format from the bytes; the client's declared mime is ignored. */
export function sniffChatMedia(data: Buffer, kind: ChatMediaKind): ChatMediaFile | null {
  if (kind === 'IMAGE') {
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
    if (data.length >= 8 && data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
    if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
      return { ext: 'webp', mime: 'image/webp' };
    }
  }
  const brands = ftypBrands(data);
  if (!brands) return null;
  const heif = brands.some((b) => HEIF_BRANDS.has(b));
  if (kind === 'IMAGE') return heif ? { ext: 'heic', mime: 'image/heic' } : null;
  return heif ? null : { ext: 'm4a', mime: 'audio/mp4' };
}

/** Duration from the MP4 movie header, or null when the file has none (e.g. fragmented). */
export function mp4DurationSec(data: Buffer): number | null {
  const moov = findBox(data, 0, data.length, 'moov');
  const mvhd = moov && findBox(data, moov.start, moov.end, 'mvhd');
  if (!mvhd) return null;
  const v1 = data[mvhd.start] === 1;
  if (mvhd.end - mvhd.start < (v1 ? 32 : 20)) return null;
  const timescale = data.readUInt32BE(mvhd.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(data.readBigUInt64BE(mvhd.start + 24)) : data.readUInt32BE(mvhd.start + 16);
  if (!timescale || !duration) return null;
  return duration / timescale;
}

function ftypBrands(data: Buffer): string[] | null {
  if (data.length < 16 || data.toString('ascii', 4, 8) !== 'ftyp') return null;
  const end = Math.min(data.readUInt32BE(0), data.length);
  const brands = [data.toString('latin1', 8, 12)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(data.toString('latin1', i, i + 4));
  return brands.map((b) => b.trim().toLowerCase());
}

function findBox(data: Buffer, from: number, to: number, type: string): { start: number; end: number } | null {
  let pos = from;
  while (pos + 8 <= to) {
    let size = data.readUInt32BE(pos);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > to) return null;
      size = Number(data.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) return null;
    if (data.toString('latin1', pos + 4, pos + 8) === type) return { start: pos + header, end: pos + size };
    pos += size;
  }
  return null;
}
