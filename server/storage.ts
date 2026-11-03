import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

class StorageService {
  private s3Client: S3Client | null = null;
  private bucketName: string | null = null;
  public isS3 = false;
  private localUploadDir: string;

  constructor() {
    this.localUploadDir = path.resolve(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(this.localUploadDir)) {
      fs.mkdirSync(this.localUploadDir, { recursive: true });
    }
    this.initS3();
  }

  private initS3() {
    const endpoint = process.env.AWS_ENDPOINT_URL_S3 || process.env.S3_ENDPOINT;
    const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.BUCKET_NAME || process.env.S3_BUCKET;

    if (endpoint && accessKeyId && secretAccessKey && bucket) {
      try {
        console.log(`[Storage] Initializing AntiDeploy S3 client for bucket: ${bucket}`);
        this.s3Client = new S3Client({
          endpoint,
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          // AntiDeploy documented requirement: forcePathStyle must be true
          forcePathStyle: true,
        });
        this.bucketName = bucket;
        this.isS3 = true;
        console.log('[Storage] AntiDeploy private S3 storage initialized successfully.');
      } catch (err) {
        console.error('[Storage] Error initializing S3 client:', err);
      }
    } else {
      console.log('[Storage] AntiDeploy S3 credentials not present in environment. Using local secure private storage vault.');
    }
  }

  public async uploadInvoice(
    userId: string,
    originalFilename: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ objectKey: string; isS3: boolean }> {
    const randomId = crypto.randomUUID();
    const cleanExt = path.extname(originalFilename).toLowerCase() || (mimeType === 'application/pdf' ? '.pdf' : '.png');
    const objectKey = `invoices/${userId}/${randomId}${cleanExt}`;

    if (this.isS3 && this.s3Client && this.bucketName) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: objectKey,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            userId,
            originalFilename: encodeURIComponent(originalFilename),
          },
        })
      );
      return { objectKey, isS3: true };
    }

    // Local secure storage fallback
    const localUserDir = path.join(this.localUploadDir, userId);
    if (!fs.existsSync(localUserDir)) {
      fs.mkdirSync(localUserDir, { recursive: true });
    }
    const localFilePath = path.join(this.localUploadDir, objectKey);
    const parentDir = path.dirname(localFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    await fs.promises.writeFile(localFilePath, buffer);
    return { objectKey, isS3: false };
  }

  public async getDownloadUrl(objectKey: string, expiresInSeconds: number = 900): Promise<{ url: string; isSignedS3: boolean }> {
    if (this.isS3 && this.s3Client && this.bucketName) {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
      return { url: signedUrl, isSignedS3: true };
    }

    // Local route: will be served by authorized streaming endpoint
    return { url: `/api/v1/documents/stream/${encodeURIComponent(objectKey)}`, isSignedS3: false };
  }

  /** Whether the stored object still exists (a deleted/moved file must not 500). */
  public async objectExists(objectKey: string): Promise<boolean> {
    if (this.isS3 && this.s3Client && this.bucketName) {
      try {
        await this.s3Client.send(
          new HeadObjectCommand({ Bucket: this.bucketName, Key: objectKey })
        );
        return true;
      } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode;
        if (status === 404 || err?.name === 'NotFound' || err?.Code === 'NoSuchKey') {
          return false;
        }
        throw err;
      }
    }
    const localPath = path.join(this.localUploadDir, objectKey);
    const normalized = path.normalize(localPath);
    return normalized.startsWith(this.localUploadDir) && fs.existsSync(normalized);
  }

  public async getLocalFileStream(objectKey: string): Promise<fs.ReadStream | null> {
    const localFilePath = path.join(this.localUploadDir, objectKey);
    // Path traversal check
    const normalized = path.normalize(localFilePath);
    if (!normalized.startsWith(this.localUploadDir)) {
      throw new Error('Path traversal detected');
    }
    if (fs.existsSync(normalized)) {
      return fs.createReadStream(normalized);
    }
    return null;
  }

  public async deleteInvoice(objectKey: string): Promise<boolean> {
    if (this.isS3 && this.s3Client && this.bucketName) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: objectKey,
          })
        );
        return true;
      } catch (err) {
        console.error('[Storage] Error deleting S3 object:', err);
        return false;
      }
    }

    const localFilePath = path.join(this.localUploadDir, objectKey);
    const normalized = path.normalize(localFilePath);
    if (normalized.startsWith(this.localUploadDir) && fs.existsSync(normalized)) {
      try {
        await fs.promises.unlink(normalized);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }
}

export const storage = new StorageService();
