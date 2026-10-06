/**
 * Event cover images, under the `event-images/` prefix. The upload flow
 * (presign → direct PUT → verify + confirm tag) lives in
 * image-upload.helpers.js, shared with the news images.
 */

import { createImageKeyHelpers } from './image-upload.helpers';

const eventImages = createImageKeyHelpers('event-images/', { logTag: 'event-image' });

/**
 * Presigned PUT URL for an event cover upload.
 * @param {{ mimeType: string, fileSize: number }} file
 * @returns {Promise<{ uploadUrl: string, s3Key: string }>}
 */
export async function generateEventImageUploadUrl(file) {
  return eventImages.generateUploadUrl(file);
}

/** Validate an uploaded cover key and return its public URL. */
export async function resolveEventImageKey(s3Key) {
  return eventImages.resolveKey(s3Key);
}
