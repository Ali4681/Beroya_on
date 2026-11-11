import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import type { AssetSlot, BrandingApp } from './branding.constants';

@Injectable()
export class BrandingStorageService {
  private readonly folder = 'branding';

  constructor(private readonly objects: ObjectStorageService) {}

  private keyOf(app: BrandingApp, layer: 'draft' | 'published', filename: string) {
    const safe = filename.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safe || safe.includes('..')) throw new Error('Invalid branding storage path');
    return `${this.folder}/${app}/${layer}/${safe}`;
  }

  /** Pre-split singleton path — kept for read/promote fallback after migration. */
  private legacyKey(layer: 'draft' | 'published', filename: string) {
    const safe = filename.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safe || safe.includes('..')) throw new Error('Invalid branding storage path');
    return `${this.folder}/${layer}/${safe}`;
  }

  async write(app: BrandingApp, layer: 'draft' | 'published', filename: string, buffer: Buffer, contentType?: string) {
    await this.objects.put('public', this.keyOf(app, layer, filename), buffer, contentType);
  }

  async read(app: BrandingApp, layer: 'draft' | 'published', filename: string): Promise<Buffer | null> {
    const scoped = await this.objects.get('public', this.keyOf(app, layer, filename));
    if (scoped) return scoped;
    return this.objects.get('public', this.legacyKey(layer, filename));
  }

  async remove(app: BrandingApp, layer: 'draft' | 'published', filename: string) {
    await this.objects.remove('public', this.keyOf(app, layer, filename));
  }

  async promoteDraftFile(app: BrandingApp, filename: string) {
    const draftScoped = this.keyOf(app, 'draft', filename);
    const draftLegacy = this.legacyKey('draft', filename);
    const published = this.keyOf(app, 'published', filename);
    const fromScoped = await this.objects.get('public', draftScoped);
    if (fromScoped) {
      await this.objects.copy('public', draftScoped, published);
      return;
    }
    const fromLegacy = await this.objects.get('public', draftLegacy);
    if (fromLegacy) {
      await this.objects.put('public', published, fromLegacy);
    }
  }

  filenameFor(slot: AssetSlot, ext: string) {
    return `${slot}${ext}`;
  }
}
