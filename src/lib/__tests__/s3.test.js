/**
 * @jest-environment node
 *
 * Unit tests for src/lib/s3.js
 *
 * These tests pin down the presigned-URL contract between our backend and S3:
 *  - explicit credentials (no silent fallback to system AWS profile),
 *  - x-amz-tagging is *both* in `signableHeaders` and `unhoistableHeaders`
 *    when tagging is requested — this is the regression that caused 403
 *    "HeadersNotSigned" from the browser PUT.
 *
 * The AWS SDK is mocked so no network/credentials are needed.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const sentCommands = [];

jest.mock('@aws-sdk/client-s3', () => {
  class FakeCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    S3Client: jest.fn().mockImplementation((config) => ({
      __config: config,
      send: jest.fn().mockImplementation((cmd) => {
        sentCommands.push(cmd);
        return Promise.resolve({});
      }),
    })),
    PutObjectCommand: class extends FakeCommand {},
    GetObjectCommand: class extends FakeCommand {},
    DeleteObjectCommand: class extends FakeCommand {},
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/signed-url'),
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

const ENV_KEYS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET'];

function setEnv(values) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
}

/** Re-import the module fresh so module-level `buildS3Client()` runs against current env. */
function loadS3Module() {
  jest.resetModules();
  return require('../s3');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('lib/s3', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    sentCommands.length = 0;
    setEnv({
      AWS_ACCESS_KEY_ID: 'AKIA_TEST',
      AWS_SECRET_ACCESS_KEY: 'SECRET_TEST',
      AWS_REGION: 'us-east-1',
      AWS_S3_BUCKET: 'calico-uploads-test',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Credentials — must be explicit, never fall back to system profile
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S3 client construction', () => {
    it('throws clearly when AWS_ACCESS_KEY_ID is missing (no silent fallback)', () => {
      setEnv({ AWS_SECRET_ACCESS_KEY: 'x' });
      expect(() => loadS3Module()).toThrow(/Missing AWS credentials/);
    });

    it('throws clearly when AWS_SECRET_ACCESS_KEY is missing', () => {
      setEnv({ AWS_ACCESS_KEY_ID: 'x' });
      expect(() => loadS3Module()).toThrow(/Missing AWS credentials/);
    });

    it('passes credentials and region explicitly to the S3 client', () => {
      loadS3Module();
      // After resetModules() the SDK mock is re-created, so require AFTER load.
      const { S3Client } = require('@aws-sdk/client-s3');

      const ctorArgs = S3Client.mock.calls[S3Client.mock.calls.length - 1][0];
      expect(ctorArgs.region).toBe('us-east-1');
      expect(ctorArgs.credentials).toEqual({
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'SECRET_TEST',
      });
    });

    it('falls back to us-east-1 when AWS_REGION is not set', () => {
      delete process.env.AWS_REGION;
      loadS3Module();
      const { S3Client } = require('@aws-sdk/client-s3');

      const ctorArgs = S3Client.mock.calls[S3Client.mock.calls.length - 1][0];
      expect(ctorArgs.region).toBe('us-east-1');
    });

    it('exports buildS3Client so other modules reuse the same builder', () => {
      const s3 = loadS3Module();
      expect(typeof s3.buildS3Client).toBe('function');
      expect(() => s3.buildS3Client()).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateUploadUrl — the regression-critical contract
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateUploadUrl', () => {
    it('builds a PutObjectCommand with bucket, key and contentType', async () => {
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { PutObjectCommand } = require('@aws-sdk/client-s3');

      await generateUploadUrl('attach/key.pdf', 'application/pdf');

      const command = getSignedUrl.mock.calls[0][1];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'calico-uploads-test',
        Key: 'attach/key.pdf',
        ContentType: 'application/pdf',
      });
    });

    it('includes ContentLength in the command when provided (prevents size bypass)', async () => {
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.pdf', 'application/pdf', { contentLength: 12345 });

      const command = getSignedUrl.mock.calls[0][1];
      expect(command.input.ContentLength).toBe(12345);
    });

    it('REGRESSION: signs `x-amz-tagging` AND keeps it unhoisted when tagging is set', async () => {
      // This is the bug we just fixed. Without both options the browser PUT
      // gets 403 ("HeadersNotSigned: x-amz-tagging").
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.pdf', 'application/pdf', {
        tagging: 'status=unconfirmed',
      });

      const opts = getSignedUrl.mock.calls[0][2];
      expect(opts.signableHeaders).toBeInstanceOf(Set);
      expect(opts.signableHeaders.has('x-amz-tagging')).toBe(true);
      expect(opts.unhoistableHeaders).toBeInstanceOf(Set);
      expect(opts.unhoistableHeaders.has('x-amz-tagging')).toBe(true);
    });

    it('attaches Tagging to the command when provided', async () => {
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.pdf', 'application/pdf', {
        tagging: 'status=unconfirmed',
      });

      const command = getSignedUrl.mock.calls[0][1];
      expect(command.input.Tagging).toBe('status=unconfirmed');
    });

    it('does NOT pass signableHeaders/unhoistableHeaders when no tagging is set', async () => {
      // Avoid changing signing semantics for non-tagged uploads (e.g. profile pictures).
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.png', 'image/png');

      const opts = getSignedUrl.mock.calls[0][2];
      expect(opts.signableHeaders).toBeUndefined();
      expect(opts.unhoistableHeaders).toBeUndefined();
    });

    it('uses default 5-minute expiry when not specified', async () => {
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.pdf', 'application/pdf');

      expect(getSignedUrl.mock.calls[0][2].expiresIn).toBe(300);
    });

    it('honors a custom expiresIn passed via options', async () => {
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.pdf', 'application/pdf', { expiresIn: 900 });

      expect(getSignedUrl.mock.calls[0][2].expiresIn).toBe(900);
    });

    it('supports legacy positional expiresIn (number) as 3rd arg', async () => {
      const { generateUploadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateUploadUrl('k.pdf', 'application/pdf', 600);

      expect(getSignedUrl.mock.calls[0][2].expiresIn).toBe(600);
    });

    it('returns the signed URL string from the presigner', async () => {
      const { generateUploadUrl } = loadS3Module();
      const url = await generateUploadUrl('k.pdf', 'application/pdf');
      expect(url).toBe('https://s3.amazonaws.com/signed-url');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateDownloadUrl
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateDownloadUrl', () => {
    it('builds a GetObjectCommand for the given key', async () => {
      const { generateDownloadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');

      await generateDownloadUrl('attach/file.pdf');

      const command = getSignedUrl.mock.calls[0][1];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'calico-uploads-test',
        Key: 'attach/file.pdf',
      });
    });

    it('uses default 1-hour expiry', async () => {
      const { generateDownloadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateDownloadUrl('k.pdf');

      expect(getSignedUrl.mock.calls[0][2].expiresIn).toBe(3600);
    });

    it('honors a custom expiresIn', async () => {
      const { generateDownloadUrl } = loadS3Module();
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await generateDownloadUrl('k.pdf', 60);

      expect(getSignedUrl.mock.calls[0][2].expiresIn).toBe(60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteObject
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteObject', () => {
    it('sends a DeleteObjectCommand for the given key', async () => {
      const { deleteObject } = loadS3Module();
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

      await deleteObject('attach/x.pdf');

      expect(sentCommands.length).toBe(1);
      expect(sentCommands[0]).toBeInstanceOf(DeleteObjectCommand);
      expect(sentCommands[0].input).toMatchObject({
        Bucket: 'calico-uploads-test',
        Key: 'attach/x.pdf',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getPublicUrl
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getPublicUrl', () => {
    it('builds the canonical S3 public URL using bucket + region', () => {
      const { getPublicUrl } = loadS3Module();
      expect(getPublicUrl('attach/x.pdf')).toBe(
        'https://calico-uploads-test.s3.us-east-1.amazonaws.com/attach/x.pdf',
      );
    });

    it('falls back to us-east-1 when AWS_REGION is unset at call time', () => {
      const { getPublicUrl } = loadS3Module();
      delete process.env.AWS_REGION;
      expect(getPublicUrl('k.pdf')).toContain('.s3.us-east-1.amazonaws.com/');
    });
  });
});
