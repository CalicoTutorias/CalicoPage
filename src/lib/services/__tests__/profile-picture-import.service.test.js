/**
 * importExternalProfilePicture — copies an OAuth avatar into our S3 bucket.
 * Best-effort contract: never throws, returns the new URL or null.
 */

jest.mock('../../s3', () => ({
  buildS3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  generateUploadUrl: jest.fn(),
  uploadObject: jest.fn().mockResolvedValue(undefined),
  deleteObject: jest.fn().mockResolvedValue(undefined),
  headObject: jest.fn(),
  getPublicUrl: jest.fn((key) => `https://bucket.s3.us-east-1.amazonaws.com/${key}`),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectTaggingCommand: jest.fn(),
}));

jest.mock('../../repositories/user.repository', () => ({
  findById: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
}));

import { importExternalProfilePicture } from '../profile-picture.service';
import { uploadObject, deleteObject } from '../../s3';
import * as userRepo from '../../repositories/user.repository';

const GOOGLE = 'https://lh3.googleusercontent.com/a/ACg8ocABC=s1024-c';

function mockFetch({ ok = true, status = 200, type = 'image/webp', bytes = 1000 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)),
  });
}

describe('importExternalProfilePicture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    userRepo.findById.mockResolvedValue({ id: 'user-1', profilePictureUrl: GOOGLE });
  });

  it('downloads the WebP variant, uploads it under the user prefix and updates the row', async () => {
    mockFetch();
    const url = await importExternalProfilePicture('user-1', GOOGLE);

    expect(global.fetch.mock.calls[0][0]).toBe(`${GOOGLE}-rw`);
    const [key, body, type, opts] = uploadObject.mock.calls[0];
    expect(key).toMatch(/^profile-pictures\/user-1\/[0-9a-f-]{36}\.webp$/);
    expect(body.length).toBe(1000);
    expect(type).toBe('image/webp');
    expect(opts.tagging).toBe('status=confirmed');
    expect(userRepo.update).toHaveBeenCalledWith('user-1', { profilePictureUrl: url });
    expect(url).toContain(key);
  });

  it('returns null and uploads nothing when Google answers 429', async () => {
    mockFetch({ ok: false, status: 429 });
    expect(await importExternalProfilePicture('user-1', GOOGLE)).toBeNull();
    expect(uploadObject).not.toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('rejects non-image content types', async () => {
    mockFetch({ type: 'text/html' });
    expect(await importExternalProfilePicture('user-1', GOOGLE)).toBeNull();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('does not overwrite a picture the user changed meanwhile and removes the copy', async () => {
    mockFetch();
    userRepo.findById.mockResolvedValue({
      id: 'user-1',
      profilePictureUrl: 'https://bucket.s3.us-east-1.amazonaws.com/profile-pictures/user-1/mine.webp',
    });
    expect(await importExternalProfilePicture('user-1', GOOGLE)).toBeNull();
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalledWith(uploadObject.mock.calls[0][0]);
  });

  it('ignores missing ids or non-https sources without fetching', async () => {
    global.fetch = jest.fn();
    expect(await importExternalProfilePicture(null, GOOGLE)).toBeNull();
    expect(await importExternalProfilePicture('user-1', 'data:image/png;base64,xx')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
