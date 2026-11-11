import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';
import type { AppConfig } from '../../config/configuration';

export type ObjectVisibility = 'public' | 'private';

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly root = resolve(process.cwd(), 'storage');
  private readonly cfg: AppConfig['r2'];
  private client: S3Client | null = null;

  constructor(config: ConfigService) {
    this.cfg = config.getOrThrow<AppConfig>('app').r2;
  }

  onModuleInit() {
    if (!this.cfg.enabled) {
      mkdirSync(this.root, { recursive: true });
      this.logger.log('Object storage: local filesystem (R2 not configured)');
      return;
    }
    this.client = new S3Client({
      region: this.cfg.region || 'auto',
      endpoint: this.cfg.endpoint,
      credentials: {
        accessKeyId: this.cfg.accessKeyId,
        secretAccessKey: this.cfg.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.logger.log(
      `Object storage: Cloudflare R2 (public=${this.cfg.publicBucket}, private=${this.cfg.privateBucket})`,
    );
  }

  get enabled() {
    return this.cfg.enabled;
  }

  get publicBaseUrl() {
    return this.cfg.publicBaseUrl;
  }

  get orphanTtlSeconds() {
    return this.cfg.mediaOrphanTtlSeconds;
  }

  /** CDN URL for a public object key, or null when R2 public base is unset. */
  publicUrl(key: string) {
    if (!this.cfg.enabled || !this.cfg.publicBaseUrl) return null;
    return `${this.cfg.publicBaseUrl}/${key.replace(/^\/+/, '')}`;
  }

  async put(visibility: ObjectVisibility, key: string, body: Buffer, contentType?: string) {
    const objectKey = this.normalize(key);
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket(visibility),
          Key: objectKey,
          Body: body,
          ContentType: contentType,
        }),
      );
      return objectKey;
    }
    const path = this.localPath(objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return objectKey;
  }

  async get(visibility: ObjectVisibility, key: string): Promise<Buffer | null> {
    const objectKey = this.normalize(key);
    if (this.client) {
      try {
        const res = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket(visibility), Key: objectKey }),
        );
        if (!res.Body) return null;
        return Buffer.from(await res.Body.transformToByteArray());
      } catch (error) {
        if (this.isNotFound(error)) return null;
        throw error;
      }
    }
    try {
      return await readFile(this.localPath(objectKey));
    } catch {
      return null;
    }
  }

  async exists(visibility: ObjectVisibility, key: string) {
    const objectKey = this.normalize(key);
    if (this.client) {
      try {
        await this.client.send(new HeadObjectCommand({ Bucket: this.bucket(visibility), Key: objectKey }));
        return true;
      } catch (error) {
        if (this.isNotFound(error)) return false;
        throw error;
      }
    }
    return existsSync(this.localPath(objectKey));
  }

  async remove(visibility: ObjectVisibility, key: string | null | undefined) {
    if (!key) return;
    const objectKey = this.normalize(key);
    if (this.client) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(visibility), Key: objectKey }));
      return;
    }
    await rm(this.localPath(objectKey), { force: true });
  }

  async copy(visibility: ObjectVisibility, fromKey: string, toKey: string) {
    const from = this.normalize(fromKey);
    const to = this.normalize(toKey);
    if (this.client) {
      const bucket = this.bucket(visibility);
      await this.client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${from}`,
          Key: to,
        }),
      );
      return to;
    }
    const dest = this.localPath(to);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(this.localPath(from), dest);
    return to;
  }

  async presignUpload(visibility: ObjectVisibility, key: string, contentType?: string) {
    if (!this.client) {
      throw new Error('Presigned uploads require R2 to be configured');
    }
    const objectKey = this.normalize(key);
    const command = new PutObjectCommand({
      Bucket: this.bucket(visibility),
      Key: objectKey,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: this.cfg.presignedUploadTtlSeconds });
    return { url, key: objectKey, expires_in: this.cfg.presignedUploadTtlSeconds };
  }

  async presignDownload(visibility: ObjectVisibility, key: string) {
    if (!this.client) {
      throw new Error('Presigned downloads require R2 to be configured');
    }
    const objectKey = this.normalize(key);
    const command = new GetObjectCommand({ Bucket: this.bucket(visibility), Key: objectKey });
    const url = await getSignedUrl(this.client, command, { expiresIn: this.cfg.presignedDownloadTtlSeconds });
    return { url, key: objectKey, expires_in: this.cfg.presignedDownloadTtlSeconds };
  }

  private bucket(visibility: ObjectVisibility) {
    return visibility === 'public' ? this.cfg.publicBucket : this.cfg.privateBucket;
  }

  private normalize(key: string) {
    const cleaned = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleaned || cleaned.includes('..')) {
      throw new Error('Invalid object storage key');
    }
    return cleaned;
  }

  private localPath(key: string) {
    const path = resolve(join(this.root, key));
    const fromRoot = relative(this.root, path);
    if (!fromRoot || fromRoot.startsWith('..') || fromRoot.includes('..')) {
      throw new Error('Invalid object storage path');
    }
    return path;
  }

  private isNotFound(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    const code =
      error && typeof error === 'object' && '$metadata' in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    return name === 'NoSuchKey' || name === 'NotFound' || code === 404;
  }
}
