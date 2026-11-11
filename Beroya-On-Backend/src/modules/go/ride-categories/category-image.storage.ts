import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { KeyedImageStorage } from '../files/keyed-image.storage';

@Injectable()
export class CategoryImageStorage extends KeyedImageStorage {
  protected readonly folder = 'ride-category-images';

  constructor(objects: ObjectStorageService) {
    super(objects);
  }
}

/** Versioned by updated_at so clients refetch after an admin replaces the image. */
export function categoryImageUrl(category: { id: string; image_key: string | null; updated_at: Date }) {
  if (!category.image_key) return null;
  return `/api/v1/go/customer/ride-categories/${category.id}/image?v=${category.updated_at.getTime()}`;
}
