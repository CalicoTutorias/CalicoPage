/**
 * @jest-environment node
 *
 * src/lib/services/event-image.service.js — event covers on the shared
 * image-upload helper, scoped to the `event-images/` prefix. S3 is mocked.
 */

jest.mock('@/lib/s3', () => ({
  generateUploadUrl: jest.fn(),
  headObject: jest.fn(),
  getPublicUrl: jest.fn(),
  setObjectTags: jest.fn(),
}));

const s3 = require('@/lib/s3');
const service = require('@/lib/services/event-image.service');

beforeEach(() => {
  jest.clearAllMocks();
  s3.generateUploadUrl.mockResolvedValue('https://s3/put');
  s3.setObjectTags.mockResolvedValue(undefined);
  s3.getPublicUrl.mockImplementation((key) => `https://bucket.s3.amazonaws.com/${key}`);
});

describe('generateEventImageUploadUrl', () => {
  it('presigns a key under event-images/ tagged unconfirmed', async () => {
    const { uploadUrl, s3Key } = await service.generateEventImageUploadUrl({ mimeType: 'image/webp', fileSize: 1024 });

    expect(uploadUrl).toBe('https://s3/put');
    expect(s3Key).toMatch(/^event-images\/[0-9a-f-]{36}\.webp$/);
    expect(s3.generateUploadUrl).toHaveBeenCalledWith(s3Key, 'image/webp', {
      contentLength: 1024,
      tagging: 'status=unconfirmed',
    });
  });

  it('rejects a disallowed type or an oversized file', async () => {
    await expect(service.generateEventImageUploadUrl({ mimeType: 'image/gif', fileSize: 10 }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.generateEventImageUploadUrl({ mimeType: 'image/png', fileSize: 6 * 1024 * 1024 }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
  });
});

describe('resolveEventImageKey', () => {
  it('verifies the object, confirms its tag and returns the public URL', async () => {
    s3.headObject.mockResolvedValue({ contentType: 'image/png', contentLength: 2048 });

    const url = await service.resolveEventImageKey('event-images/a.png');

    expect(url).toBe('https://bucket.s3.amazonaws.com/event-images/a.png');
    expect(s3.setObjectTags).toHaveBeenCalledWith('event-images/a.png', { status: 'confirmed' });
  });

  it('rejects a key from another domain (news) or with a traversal', async () => {
    await expect(service.resolveEventImageKey('news-images/a.png')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.resolveEventImageKey('event-images/../x.png')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(s3.headObject).not.toHaveBeenCalled();
  });

  it('reports a missing upload as NOT_FOUND', async () => {
    s3.headObject.mockRejectedValue(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
    await expect(service.resolveEventImageKey('event-images/a.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
