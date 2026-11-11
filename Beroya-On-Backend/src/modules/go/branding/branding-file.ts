import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import {
  BLOCKED_EXTENSIONS,
  MAX_GIF_BYTES,
  MAX_IMAGE_BYTES,
  MAX_LOTTIE_BYTES,
} from './branding.constants';

export type DetectedKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'lottie';

export type DecodedBrandingFile = {
  buffer: Buffer;
  kind: DetectedKind;
  ext: string;
  mime: string;
};

const MIME: Record<DetectedKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  lottie: 'application/json',
};

const EXT: Record<DetectedKind, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  gif: '.gif',
  lottie: '.json',
};

export function decodeBrandingFile(dataBase64: string, filename?: string): DecodedBrandingFile {
  const rawName = (filename ?? '').split(/[/\\]/).pop() ?? '';
  const ext = rawName.includes('.') ? rawName.slice(rawName.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, `File type .${ext} is not allowed`);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid base64 payload');
  }
  if (!buffer.length) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Empty file');

  const kind = sniff(buffer);
  if (!kind) {
    throw new GoException(
      GoErrorCode.VALIDATION_ERROR,
      'Only PNG, JPG, JPEG, WEBP, GIF, and Lottie JSON are allowed',
    );
  }

  const limit = kind === 'gif' ? MAX_GIF_BYTES : kind === 'lottie' ? MAX_LOTTIE_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length > limit) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, `File exceeds ${Math.round(limit / 1024 / 1024)}MB limit`);
  }

  return { buffer, kind, ext: EXT[kind], mime: MIME[kind] };
}

export function sniff(buffer: Buffer): DetectedKind | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (buffer.length >= 6) {
    const head = buffer.toString('ascii', 0, 6);
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  }
  if (looksLikeExecutable(buffer)) return null;
  if (looksLikeLottie(buffer)) return 'lottie';
  return null;
}

function looksLikeExecutable(buffer: Buffer): boolean {
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true;
  if (buffer[0] === 0x7f && buffer.toString('ascii', 1, 4) === 'ELF') return true;
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05)) {
    return true;
  }
  return false;
}

function looksLikeLottie(buffer: Buffer): boolean {
  const start = buffer.findIndex((b) => b !== 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09);
  if (start < 0 || buffer[start] !== 0x7b) return false;
  const text = buffer.toString('utf8');
  if (/<\s*(html|script|php)/i.test(text)) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const obj = parsed as Record<string, unknown>;
    return 'v' in obj || 'layers' in obj || 'assets' in obj || 'fr' in obj;
  } catch {
    return false;
  }
}
