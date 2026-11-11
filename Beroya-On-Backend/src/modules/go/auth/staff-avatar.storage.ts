import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { KeyedImageStorage } from '../files/keyed-image.storage';

@Injectable()
export class StaffAvatarStorage extends KeyedImageStorage {
  protected readonly folder = 'staff-avatars';

  constructor(objects: ObjectStorageService) {
    super(objects);
  }
}
