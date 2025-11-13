/**
 * AWS S3 Storage Implementation
 */

import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  NotFound
} from '@aws-sdk/client-s3';
import { Config } from '../config';
import { Logger } from '../utils';

export class S3Storage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = Config.S3_BUCKET;
    
    this.client = new S3Client({
      region: Config.S3_REGION,
      credentials: {
        accessKeyId: Config.S3_ACCESS_KEY,
        secretAccessKey: Config.S3_SECRET_KEY,
      },
      ...(Config.S3_ENDPOINT && {
        endpoint: Config.S3_ENDPOINT,
        forcePathStyle: true, // Required for MinIO and some S3-compatible services
      }),
    });

    Logger.info('S3Storage initialized', {
      bucket: this.bucket,
      region: Config.S3_REGION,
      hasEndpoint: !!Config.S3_ENDPOINT,
    });
  }

  async put(key: string, data: Buffer | string, contentType: string): Promise<string> {
    try {
      const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read', // Make objects publicly accessible
        })
      );

      const url = this.getPublicUrl(key);
      
      Logger.debug('S3 put successful', {
        key,
        size: buffer.length,
        url,
      });

      return url;
    } catch (error) {
      Logger.error('S3 put failed', {
        key,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) {
        throw new Error('No data returned from S3');
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      Logger.debug('S3 get successful', {
        key,
        size: buffer.length,
      });

      return buffer;
    } catch (error) {
      if (error instanceof NotFound || (error as any).name === 'NoSuchKey') {
        throw new Error(`S3 object not found: ${key}`);
      }
      Logger.error('S3 get failed', {
        key,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error) {
      if (error instanceof NotFound || (error as any).name === 'NotFound' || (error as any).name === 'NoSuchKey') {
        return false;
      }
      Logger.warn('S3 exists check failed', {
        key,
        error: (error as Error).message,
      });
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      Logger.debug('S3 delete successful', { key });
    } catch (error) {
      Logger.error('S3 delete failed', {
        key,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async list(prefix: string): Promise<Array<{
    path: string;
    url: string;
    size: number;
    uploadedAt: Date;
  }>> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
        })
      );

      const objects = response.Contents || [];

      return objects.map(obj => ({
        path: obj.Key || '',
        url: this.getPublicUrl(obj.Key || ''),
        size: obj.Size || 0,
        uploadedAt: obj.LastModified || new Date(),
      }));
    } catch (error) {
      Logger.error('S3 list failed', {
        prefix,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  private getPublicUrl(key: string): string {
    if (Config.S3_ENDPOINT) {
      // Custom endpoint (MinIO, DigitalOcean Spaces, etc.)
      const endpoint = Config.S3_ENDPOINT.replace(/\/$/, '');
      return `${endpoint}/${this.bucket}/${key}`;
    } else {
      // Standard AWS S3
      return `https://${this.bucket}.s3.${Config.S3_REGION}.amazonaws.com/${key}`;
    }
  }
}

