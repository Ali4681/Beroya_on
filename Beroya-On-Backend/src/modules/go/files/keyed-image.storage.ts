import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { decodePassportIcon, passportIconMime } from '../passport/passport-icon.storage';

/** One JPEG/PNG/WebP per owner id. Relative key `ownerId.ext` is stored in DB; object path is `<folder>/<key>`. */
export abstract class KeyedImageStorage {
  protected abstract readonly folder: string;

  constructor(protected readonly objects: ObjectStorageService) {}

  /** Decodes a base64 image (data URL prefix allowed) and replaces any older format for this owner. */
  async save(ownerId: string, raw: string) {
    const { data, image } = decodePassportIcon(raw);
    for (const ext of ['jpg', 'png', 'webp'] as const) {
      if (ext !== image.ext) await this.remove(`${ownerId}.${ext}`);
    }
    const key = `${ownerId}.${image.ext}`;
    await this.objects.put('public', this.objectKey(key), data, image.mime);
    return key;
  }

  async read(key: string) {
    return this.objects.get('public', this.objectKey(key));
  }

  async remove(key: string | null | undefined) {
    if (!key) return;
    await this.objects.remove('public', this.objectKey(key));
  }

  mimeOf(key: string) {
    return passportIconMime(key);
  }

  private objectKey(key: string) {
    return `${this.folder}/${key}`;
  }
}
