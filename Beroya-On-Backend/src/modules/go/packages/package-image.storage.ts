import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { KeyedImageStorage } from '../files/keyed-image.storage';

@Injectable()
export class PackageImageStorage extends KeyedImageStorage {
  protected readonly folder = 'package-images';

  constructor(objects: ObjectStorageService) {
    super(objects);
  }
}

/** Versioned by updated_at so clients refetch after an admin replaces the image. */
export function packageImageUrl(pkg: { id: string; image_key: string | null; updated_at: Date }) {
  if (!pkg.image_key) return null;
  return `/api/v1/go/customer/packages/${pkg.id}/image?v=${pkg.updated_at.getTime()}`;
}
