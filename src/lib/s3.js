import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function buildS3Client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      '[s3] Missing AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env (and restart the dev server).'
    );
  }

  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  });
}

const s3Client = buildS3Client();

export { buildS3Client };

const BUCKET = process.env.AWS_S3_BUCKET || 'calico-uploads';

/**
 * Generate a presigned URL for uploading a file directly to S3.
 * @param {string} key - S3 object key (e.g., "profiles/{userId}/{uuid}.jpg")
 * @param {string} contentType - MIME type (e.g., "image/jpeg")
 * @param {object} [options]
 * @param {number} [options.expiresIn=300] - URL expiration in seconds (default 5 min)
 * @param {number} [options.contentLength] - Exact file size in bytes (signed into URL to prevent size bypass)
 * @param {string} [options.tagging] - URL-encoded tagging string (e.g., "status=unconfirmed")
 * @returns {Promise<string>} Presigned PUT URL
 */
export async function generateUploadUrl(key, contentType, options = {}) {
  const { expiresIn = 300, contentLength, tagging } = typeof options === 'number'
    ? { expiresIn: options }  // backward compat: generateUploadUrl(key, type, 300)
    : options;

  const commandInput = {
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  };

  if (contentLength) {
    commandInput.ContentLength = contentLength;
  }

  if (tagging) {
    commandInput.Tagging = tagging;
  }

  const command = new PutObjectCommand(commandInput);
  // When Tagging is set, the browser sends `x-amz-tagging` but the presigner
  // omits it from SignedHeaders by default and S3 rejects with 403
  // ("HeadersNotSigned"). Force it into the signature AND keep it as a header
  // (not hoisted into the query string).
  const presignOptions = { expiresIn };
  if (tagging) {
    presignOptions.signableHeaders = new Set(['x-amz-tagging']);
    presignOptions.unhoistableHeaders = new Set(['x-amz-tagging']);
  }
  return getSignedUrl(s3Client, command, presignOptions);
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
