import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Local filesystem stub for emergency audio until an object store is wired.
 * Temp: storage/emergency/temp/{id}.bin
 * Saved: storage/emergency/saved/{id}.bin
 */
@Injectable()
export class EmergencyStorageService {
  private readonly root = join(process.cwd(), 'storage', 'emergency');

  constructor() {
    mkdirSync(join(this.root, 'temp'), { recursive: true });
    mkdirSync(join(this.root, 'saved'), { recursive: true });
  }

  tempKey(emergencyId: string) {
    return `temp/${emergencyId}.bin`;
  }

  savedKey(emergencyId: string) {
    return `saved/${emergencyId}.bin`;
  }

  private abs(key: string) {
    return join(this.root, key);
  }

  appendTemp(emergencyId: string, chunk: Buffer) {
    const key = this.tempKey(emergencyId);
    const path = this.abs(key);
    const prev = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    writeFileSync(path, Buffer.concat([prev, chunk]));
    return key;
  }

  promoteToSaved(emergencyId: string): string {
    const temp = this.abs(this.tempKey(emergencyId));
    const savedKey = this.savedKey(emergencyId);
    const saved = this.abs(savedKey);
    if (!existsSync(temp)) {
      writeFileSync(saved, Buffer.alloc(0));
    } else {
      renameSync(temp, saved);
    }
    return savedKey;
  }

  discardTemp(emergencyId: string) {
    const path = this.abs(this.tempKey(emergencyId));
    if (existsSync(path)) unlinkSync(path);
  }

  deleteSaved(key: string) {
    const path = this.abs(key);
    if (existsSync(path)) unlinkSync(path);
  }

  readSaved(key: string): Buffer | null {
    const path = this.abs(key);
    if (!existsSync(path)) return null;
    return readFileSync(path);
  }

  /** Read temp or saved blob by relative key (temp/{id}.bin | saved/{id}.bin). */
  read(key: string): Buffer | null {
    return this.readSaved(key);
  }

  readTemp(emergencyId: string): Buffer | null {
    return this.readSaved(this.tempKey(emergencyId));
  }

  existsTemp(emergencyId: string) {
    return existsSync(this.abs(this.tempKey(emergencyId)));
  }
}
