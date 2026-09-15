/**
 * One-off backfill: copy Google-hosted profile pictures into our S3 bucket.
 *
 * Why: `lh3.googleusercontent.com` answers 429 when a page hot-links many
 * avatars, so Google pictures randomly stop rendering. New sign-ins are copied
 * automatically (importExternalProfilePicture); this migrates the old rows.
 * Mirrors that service — keep the two in sync.
 *
 * For each user whose profile_picture_url is on googleusercontent.com:
 *   1. download the 1024px WebP variant (`=s1024-c-rw`), retrying on 429
 *   2. PutObject to profile-pictures/{userId}/{uuid}.webp (tag status=confirmed)
 *   3. point profile_picture_url at the S3 public URL
 * The Google URL is printed next to the new one so a row can be reverted.
 *
 * Usage (dry run — lists what would change, writes nothing):
 *   pnpm db:backfill:google-avatars
 * Apply:
 *   pnpm db:backfill:google-avatars -- --apply
 *
 * Needs DATABASE_URL and AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION
 * (AWS_S3_BUCKET optional, defaults to calico-uploads) — all in .env.
 */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const TARGET_SIZE = 1024;
const APPLY = process.argv.includes('--apply');
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const PAUSE_MS = 500;            // be gentle with Google's CDN
const RETRY_DELAYS_MS = [2000, 5000, 10000];

const { DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;
const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.AWS_S3_BUCKET || 'calico-uploads';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Run with --env-file=.env');
  process.exit(1);
}
if (APPLY && (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY)) {
  console.error('ERROR: AWS credentials are not set (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).');
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const pool = new Pool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 5432,
  database: url.pathname.slice(1).split('?')[0],
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    ? false
    : { rejectUnauthorized: false },
});
const s3 = APPLY
  ? new S3Client({ region: REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } })
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sourceUrl(googleUrl) {
  // Normalise any size token to the target and ask for WebP.
  const base = /=s\d+/.test(googleUrl)
    ? googleUrl.replace(/=s\d+(-c)?(-rw)?$/, `=s${TARGET_SIZE}-c`)
    : `${googleUrl}=s${TARGET_SIZE}-c`;
  return `${base}-rw`;
}

async function download(src) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(src, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'image/webp,image/jpeg,image/png' },
    });
    if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      console.log(`    429 from Google — retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s`);
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED[type]) throw new Error(`unsupported content-type ${type}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) throw new Error(`invalid size ${body.length}`);
    return { body, type, ext: ALLOWED[type] };
  }
}

try {
  const { rows } = await pool.query(
    `SELECT id, email, profile_picture_url
       FROM users
      WHERE profile_picture_url ~ '^https://[a-z0-9-]+\\.googleusercontent\\.com/'
      ORDER BY email`,
  );

  if (rows.length === 0) {
    console.log('Nothing to do: no Google-hosted profile pictures left.');
  } else {
    console.log(`${rows.length} user(s) with a Google-hosted picture${APPLY ? '' : ' (dry run)'}:`);
  }

  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    const src = sourceUrl(r.profile_picture_url);
    console.log(`  ${r.email}\n    from ${r.profile_picture_url}`);
    if (!APPLY) continue;

    try {
      const { body, type, ext } = await download(src);
      const key = `profile-pictures/${r.id}/${randomUUID()}.${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: body, ContentType: type, Tagging: 'status=confirmed',
      }));
      const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
      // Guard against a concurrent change (e.g. the user uploaded a picture).
      const upd = await pool.query(
        'UPDATE users SET profile_picture_url = $1 WHERE id = $2 AND profile_picture_url = $3',
        [publicUrl, r.id, r.profile_picture_url],
      );
      if (upd.rowCount === 1) {
        ok++;
        console.log(`    to   ${publicUrl}  (${Math.round(body.length / 1024)} KB)`);
      } else {
        console.log('    skipped: row changed meanwhile');
      }
    } catch (err) {
      failed++;
      console.log(`    FAILED: ${err.message} — row left untouched`);
    }
    await sleep(PAUSE_MS);
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to copy these into S3.');
  } else {
    console.log(`\nDone: ${ok} migrated, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  }
} catch (err) {
  console.error('Backfill failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
