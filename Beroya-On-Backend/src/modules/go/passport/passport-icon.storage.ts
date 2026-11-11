import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';

export type PassportIconKind = 'customer' | 'driver';
type IconFile = { ext: 'jpg' | 'png' | 'webp'; mime: string };

@Injectable()
export class PassportIconStorage {
  private readonly folder = 'passport-icons';

  constructor(private readonly objects: ObjectStorageService) {}

  async save(kind: PassportIconKind, levelId: string, data: Buffer, image: IconFile) {
    for (const ext of ['jpg', 'png', 'webp'] as const) {
      if (ext !== image.ext) await this.remove(`${kind}/${levelId}.${ext}`);
    }
    const key = `${kind}/${levelId}.${image.ext}`;
    await this.objects.put('public', `${this.folder}/${key}`, data, image.mime);
    return key;
  }

  async read(key: string) {
    return this.objects.get('public', `${this.folder}/${key}`);
  }

  async remove(key: string | null | undefined) {
    if (!key) return;
    try {
      await this.objects.remove('public', `${this.folder}/${key}`);
    } catch {
      /* A hand-typed key from before uploads is not a file in this folder. */
    }
  }
}

export function decodePassportIcon(raw: string) {
  const trimmed = raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/\s/g, '');
  const data = Buffer.from(trimmed, 'base64');
  if (!data.length || data.length > 2_000_000) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Icon image is too large');
  }
  const image = sniffIcon(data);
  if (!image) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Icon must be a JPEG, PNG, or WebP');
  return { data, image };
}

export function passportIconMime(key: string) {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export function passportIconUrl(scope: 'customer' | 'driver', levelId: string, key: string | null | undefined) {
  if (!key) return null;
  return `/api/v1/go/${scope}/passport/levels/${levelId}/icon`;
}

function sniffIcon(data: Buffer): IconFile | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (data.length >= 8 && data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}
