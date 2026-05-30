/**
 * Client-side image compression for profile pictures.
 *
 * Strategy: load into a Canvas, scale to fit within MAX_DIMENSION while
 * preserving aspect ratio (cover-cropped to a square so the avatar shows
 * exactly what the user previewed), then export as WebP (q=0.85).
 *
 * Typical result: a 5 MB phone JPEG → ~80–150 KB WebP. The browser does the
 * heavy lifting, so we never pay for resizing server-side.
 */

const MAX_DIMENSION = 512;
const OUTPUT_TYPE = 'image/webp';
const OUTPUT_QUALITY = 0.85;
const MAX_INPUT_SIZE = 5 * 1024 * 1024; // 5 MB raw input cap

const ACCEPTED_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Compress a user-selected image File into a square WebP Blob suitable for
 * upload as a profile picture.
 *
 * @param {File} file - The image File from an <input type="file">.
 * @param {{ maxDimension?: number, quality?: number }} [opts]
 * @returns {Promise<{ blob: Blob, mimeType: string, size: number }>}
 * @throws Error with `.code` in: INVALID_TYPE, FILE_TOO_LARGE, READ_FAILED,
 *         DECODE_FAILED, ENCODE_FAILED.
 */
export async function compressProfilePicture(file, opts = {}) {
  if (!(file instanceof Blob)) {
    const err = new Error('No se recibió un archivo');
    err.code = 'INVALID_TYPE';
    throw err;
  }

  if (file.type && !ACCEPTED_INPUT_TYPES.has(file.type)) {
    const err = new Error('Formato no soportado. Usa JPG, PNG o WebP.');
    err.code = 'INVALID_TYPE';
    throw err;
  }

  if (file.size > MAX_INPUT_SIZE) {
    const err = new Error(
      `La imagen pesa más de ${MAX_INPUT_SIZE / 1024 / 1024} MB. Elige una más pequeña.`,
    );
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const maxDim = opts.maxDimension ?? MAX_DIMENSION;
  const quality = opts.quality ?? OUTPUT_QUALITY;

  const bitmap = await decode(file);

  try {
    // Square cover-crop: take the largest centered square then scale down.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);
    const target = Math.min(maxDim, side);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const err = new Error('Tu navegador no soporta el procesado de imágenes');
      err.code = 'DECODE_FAILED';
      throw err;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);

    const blob = await canvasToBlob(canvas, OUTPUT_TYPE, quality);
    if (!blob) {
      const err = new Error('No se pudo procesar la imagen');
      err.code = 'ENCODE_FAILED';
      throw err;
    }

    return { blob, mimeType: OUTPUT_TYPE, size: blob.size };
  } finally {
    // Free decoder memory eagerly — phones with multi-MB JPEGs care.
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

/**
 * Decode the file into an ImageBitmap (preferred) or fall back to <img>.
 * createImageBitmap is faster and off-main-thread on most browsers.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some browsers reject HEIC/odd PNGs here — fall through to <img>.
    }
  }
  return decodeViaImg(file);
}

function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Shape-compatible with ImageBitmap for drawImage(src, sx, sy, sw, sh, …)
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const err = new Error('No se pudo leer la imagen');
      err.code = 'DECODE_FAILED';
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

export const __testing = { MAX_DIMENSION, OUTPUT_TYPE, MAX_INPUT_SIZE };
