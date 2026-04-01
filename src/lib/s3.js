import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'calico-uploads';

/**
 * Generate a presigned URL for uploading a file directly to S3.
 * @param {string} key - S3 object key (e.g., "profiles/{userId}/{uuid}.jpg")
 * @param {string} contentType - MIME type (e.g., "image/jpeg")
 * @param {number} expiresIn - URL expiration in seconds (default 300 = 5 min)
 * @returns {Promise<string>} Presigned PUT URL
 */
export async function generateUploadUrl(key, contentType, expiresIn = 300) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading/viewing a file from S3.
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration in seconds (default 3600 = 1 hour)
 * @returns {Promise<string>} Presigned GET URL
 */
export async function generateDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete an object from S3.
 * @param {string} key - S3 object key
 */
export async function deleteObject(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await s3Client.send(command);
}

/**
 * Build the public URL for an S3 object (if bucket has public read).
 * @param {string} key - S3 object key
 * @returns {string} Public URL
 */
export function getPublicUrl(key) {
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}
