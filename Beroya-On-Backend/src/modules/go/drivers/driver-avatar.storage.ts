import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { KeyedImageStorage } from '../files/keyed-image.storage';

@Injectable()
export class DriverAvatarStorage extends KeyedImageStorage {
  protected readonly folder = 'driver-avatars';

  constructor(objects: ObjectStorageService) {
    super(objects);
  }
}
