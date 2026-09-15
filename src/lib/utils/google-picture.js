/**
 * Google profile picture URL helpers.
 *
 * The `picture` claim in a Google ID token points at a 96px thumbnail
 * (`...=s96-c`). That is fine for a 44px avatar but looks pixelated anywhere
 * larger (profile header, picture lightbox). The size is just a URL parameter
 * Google resizes on the fly, so we ask for a bigger square before persisting.
 *
 * Only googleusercontent.com URLs are touched; S3 uploads and anything else
 * pass through untouched.
 */

export const GOOGLE_PICTURE_SIZE = 1024;

const GOOGLE_HOST_RE = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//i;
// `=s96-c`, `=s96`, `=s96-c-rp-mo` … — the size token at the end of the URL.
const SIZE_PARAM_RE = /=s\d+(?=(?:-[a-z0-9]+)*$)/i;

/**
 * @param {string|null|undefined} url
 * @param {number} [size]
 * @returns {string|null|undefined} the same URL requesting a `size`px square
 */
export function normalizeGooglePictureUrl(url, size = GOOGLE_PICTURE_SIZE) {
  if (typeof url !== 'string' || !GOOGLE_HOST_RE.test(url)) return url;

  if (SIZE_PARAM_RE.test(url)) {
    return url.replace(SIZE_PARAM_RE, `=s${size}`);
  }
  // No sizing params at all (legacy `/photo.jpg` style URLs) → append one.
  if (!url.includes('=')) {
    return `${url}=s${size}-c`;
  }
  return url;
}
