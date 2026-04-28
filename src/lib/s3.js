import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectTaggingCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.AWS_S3_BUCKET || 'calico-uploads';

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Get the underlying S3 client and bucket name for advanced operations.
 * Exported so callers don't re-instantiate a new client.
 */
export function getS3() {
  return { client: s3Client, bucket: BUCKET, region };
}

/**
 * Generate a presigned URL for uploading a file directly to S3.
 * @param {string} key - S3 object key
 * @param {string} contentType - MIME type
 * @param {object} [options]
 * @param {number} [options.expiresIn=300] - URL expiration in seconds
 * @param {number} [options.contentLength] - Exact file size in bytes (signed into URL to prevent size bypass)
 * @param {string} [options.tagging] - URL-encoded tagging string (e.g., "status=unconfirmed")
 * @returns {Promise<string>} Presigned PUT URL
 */
export async function generateUploadUrl(key, contentType, options = {}) {
  const { expiresIn = 300, contentLength, tagging } =
    typeof options === 'number' ? { expiresIn: options } : options;

  const commandInput = { Bucket: BUCKET, Key: key, ContentType: contentType };

  if (typeof contentLength === 'number' && contentLength >= 0) {
    commandInput.ContentLength = contentLength;
  }
  if (tagging) commandInput.Tagging = tagging;

  const command = new PutObjectCommand(commandInput);
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading/viewing a file from S3.
 */
export async function generateDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete an object from S3.
 */
export async function deleteObject(key) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Verify an object exists and return its metadata (size, contentType).
 * Throws an error with code 'NOT_FOUND' when the object is missing.
 */
export async function headObject(key) {
  try {
    const res = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
      contentLength: res.ContentLength,
      contentType: res.ContentType,
      etag: res.ETag,
    };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      const notFound = new Error(`S3 object not found: ${key}`);
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw err;
  }
}

/**
 * Replace the tag set on an S3 object.
 * @param {string} key
 * @param {Record<string,string>} tags
 */
export async function setObjectTags(key, tags) {
  const TagSet = Object.entries(tags).map(([Key, Value]) => ({ Key, Value: String(Value) }));
  await s3Client.send(new PutObjectTaggingCommand({ Bucket: BUCKET, Key: key, Tagging: { TagSet } }));
}

/**
 * Verify S3 connectivity and bucket access.
 * Returns { ok: true, bucket, region } on success.
 * Throws a descriptive error on failure so the caller can surface it.
 */
export async function healthCheck() {
  await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
  return { ok: true, bucket: BUCKET, region };
}

/**
 * Build the public URL for an S3 object (if bucket has public read).
 */
export function getPublicUrl(key) {
  return `https://${BUCKET}.s3.${region}.amazonaws.com/${key}`;
}
