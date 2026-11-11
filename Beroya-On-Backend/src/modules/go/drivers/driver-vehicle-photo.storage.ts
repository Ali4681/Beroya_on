import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import type { StoredImage } from './driver-document-storage.service';

@Injectable()
export class DriverVehiclePhotoStorage {
  private readonly folder = 'driver-vehicle-photos';

  constructor(private readonly objects: ObjectStorageService) {}

  async save(driverId: string, photoId: string, data: Buffer, image: StoredImage) {
    const key = `${driverId}/${photoId}.${image.ext}`;
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
