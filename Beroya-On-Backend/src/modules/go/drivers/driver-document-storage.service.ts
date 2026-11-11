import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';

export type StoredImage = { ext: 'jpg' | 'png' | 'webp'; mime: string };

@Injectable()
export class DriverDocumentStorageService {
  private readonly folder = 'driver-documents';

  constructor(private readonly objects: ObjectStorageService) {}

  async save(driverId: string, type: string, data: Buffer, image: StoredImage, side: 'front' | 'back' = 'front') {
    const key = side === 'back' ? `${driverId}/${type}.back.${image.ext}` : `${driverId}/${type}.${image.ext}`;
    await this.objects.put('private', `${this.folder}/${key}`, data, image.mime);
    return key;
  }

  async read(key: string) {
    return this.objects.get('private', `${this.folder}/${key}`);
  }

  async remove(key: string | null | undefined) {
    if (!key) return;
    await this.objects.remove('private', `${this.folder}/${key}`);
  }
}
