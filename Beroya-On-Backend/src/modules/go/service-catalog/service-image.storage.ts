import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { KeyedImageStorage } from '../files/keyed-image.storage';

@Injectable()
export class ServiceImageStorage extends KeyedImageStorage {
  protected readonly folder = 'service-images';

  constructor(objects: ObjectStorageService) {
    super(objects);
  }
}

/** Versioned by updated_at so clients refetch after an admin replaces the image. */
export function serviceImageUrl(service: { code: string; image_key: string | null; updated_at: Date }) {
  if (!service.image_key) return null;
  return `/api/v1/go/customer/services/${service.code}/image?v=${service.updated_at.getTime()}`;
}
