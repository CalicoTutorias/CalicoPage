/**
 * Unit tests for src/lib/repositories/marketing-post.repository.js
 * Pins the bucket routing: posts live in AWS_S3_POSTS_BUCKET when set, and
 * fall back to the default bucket (undefined → s3.js uses AWS_S3_BUCKET).
 */

jest.mock('@/lib/s3', () => ({
  listSubPrefixes: jest.fn(),
  listObjectKeys: jest.fn(),
  getObject: jest.fn(),
  deleteObjects: jest.fn(),
  generateDownloadUrl: jest.fn(),
}));

const s3 = require('@/lib/s3');
const repo = require('@/lib/repositories/marketing-post.repository');

const ORIGINAL = process.env.AWS_S3_POSTS_BUCKET;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AWS_S3_POSTS_BUCKET = 'calico-posts';
});

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.AWS_S3_POSTS_BUCKET;
  else process.env.AWS_S3_POSTS_BUCKET = ORIGINAL;
});

it('test_should_use_posts_bucket_for_every_operation', async () => {
  s3.listSubPrefixes.mockResolvedValue(['marketing-posts/a/', 'marketing-posts/b/']);
  s3.getObject.mockResolvedValue({ text: async () => '{"slug":"a"}' });
  s3.listObjectKeys.mockResolvedValue(['marketing-posts/a/01.png', 'marketing-posts/a/manifest.json']);

  expect(await repo.listSlugs()).toEqual(['a', 'b']);
  expect(await repo.findManifest('a')).toEqual({ slug: 'a' });
  await repo.getFileUrl('a', '01.png', 60);
  await repo.getFile('a', '01.png');
  expect(await repo.removeAll('a')).toBe(2);

  const bucket = { bucket: 'calico-posts' };
  expect(s3.listSubPrefixes).toHaveBeenCalledWith('marketing-posts/', bucket);
  expect(s3.getObject).toHaveBeenCalledWith('marketing-posts/a/manifest.json', bucket);
  expect(s3.generateDownloadUrl).toHaveBeenCalledWith('marketing-posts/a/01.png', 60, bucket);
  expect(s3.getObject).toHaveBeenCalledWith('marketing-posts/a/01.png', bucket);
  expect(s3.listObjectKeys).toHaveBeenCalledWith('marketing-posts/a/', bucket);
  expect(s3.deleteObjects).toHaveBeenCalledWith(
    ['marketing-posts/a/01.png', 'marketing-posts/a/manifest.json'],
    bucket,
  );
});

it('test_should_fall_back_to_default_bucket_when_env_missing', async () => {
  delete process.env.AWS_S3_POSTS_BUCKET;
  s3.listSubPrefixes.mockResolvedValue([]);

  await repo.listSlugs();

  expect(s3.listSubPrefixes).toHaveBeenCalledWith('marketing-posts/', { bucket: undefined });
});

it('test_should_return_null_when_manifest_missing', async () => {
  const notFound = Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
  s3.getObject.mockRejectedValue(notFound);
  expect(await repo.findManifest('x')).toBeNull();
});
