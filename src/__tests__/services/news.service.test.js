/**
 * Unit tests for src/lib/services/news.service.js
 * Collaborators (repository + S3) are mocked at the module boundary so the
 * real service logic runs.
 */

jest.mock('@/lib/repositories/news.repository');
jest.mock('@/lib/s3', () => ({
  generateUploadUrl: jest.fn(),
  deleteObject: jest.fn(),
  headObject: jest.fn(),
  getPublicUrl: jest.fn(),
  setObjectTags: jest.fn(),
}));

const newsRepository = require('@/lib/repositories/news.repository');
const s3 = require('@/lib/s3');
const newsService = require('@/lib/services/news.service');

beforeEach(() => {
  jest.clearAllMocks();
  s3.setObjectTags.mockResolvedValue(undefined);
  s3.deleteObject.mockResolvedValue(undefined);
  s3.getPublicUrl.mockImplementation((key) => `https://bucket.s3.us-east-1.amazonaws.com/${key}`);
});

describe('createPost', () => {
  it('test_should_create_draft_by_default_without_publishedAt', async () => {
    newsRepository.create.mockImplementation(async (data) => ({ id: 'p1', ...data }));

    await newsService.createPost({
      title: '  Hola  ',
      content: '# Contenido',
      authorId: 'admin-1',
    });

    expect(newsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hola',
        content: '# Contenido',
        authorId: 'admin-1',
        isPublished: false,
        publishedAt: null,
        imageUrl: null,
      }),
    );
  });

  it('test_should_seal_publishedAt_when_created_published', async () => {
    newsRepository.create.mockImplementation(async (data) => ({ id: 'p1', ...data }));

    await newsService.createPost({
      title: 'Noticia',
      content: 'texto',
      authorId: 'admin-1',
      isPublished: true,
    });

    const arg = newsRepository.create.mock.calls[0][0];
    expect(arg.isPublished).toBe(true);
    expect(arg.publishedAt).toBeInstanceOf(Date);
  });

  it('test_should_reject_when_author_missing', async () => {
    await expect(
      newsService.createPost({ title: 'x', content: 'y', authorId: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(newsRepository.create).not.toHaveBeenCalled();
  });

  it('test_should_resolve_image_key_into_public_url', async () => {
    s3.headObject.mockResolvedValue({ contentType: 'image/png', contentLength: 1000 });
    newsRepository.create.mockImplementation(async (data) => ({ id: 'p1', ...data }));

    await newsService.createPost({
      title: 'Con imagen',
      content: 'texto',
      authorId: 'admin-1',
      imageS3Key: 'news-images/abc.png',
    });

    expect(s3.headObject).toHaveBeenCalledWith('news-images/abc.png');
    expect(newsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'https://bucket.s3.us-east-1.amazonaws.com/news-images/abc.png',
      }),
    );
  });

  it('test_should_reject_image_key_outside_news_prefix', async () => {
    await expect(
      newsService.createPost({
        title: 'x',
        content: 'y',
        authorId: 'admin-1',
        imageS3Key: 'profile-pictures/user-9/foto.png',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(s3.headObject).not.toHaveBeenCalled();
    expect(newsRepository.create).not.toHaveBeenCalled();
  });

  it('test_should_reject_image_key_that_does_not_exist_in_s3', async () => {
    const notFound = new Error('missing');
    notFound.code = 'NOT_FOUND';
    s3.headObject.mockRejectedValue(notFound);

    await expect(
      newsService.createPost({
        title: 'x',
        content: 'y',
        authorId: 'admin-1',
        imageS3Key: 'news-images/miss.png',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(newsRepository.create).not.toHaveBeenCalled();
  });
});

describe('updatePost', () => {
  it('test_should_seal_publishedAt_on_first_publish', async () => {
    newsRepository.findById.mockResolvedValue({
      id: 'p1', title: 't', isPublished: false, publishedAt: null, imageUrl: null,
    });
    newsRepository.update.mockImplementation(async (id, data) => ({ id, ...data }));

    await newsService.updatePost('p1', { isPublished: true });

    const data = newsRepository.update.mock.calls[0][1];
    expect(data.isPublished).toBe(true);
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it('test_should_keep_original_publishedAt_on_republish', async () => {
    const original = new Date('2026-01-01T00:00:00Z');
    newsRepository.findById.mockResolvedValue({
      id: 'p1', title: 't', isPublished: false, publishedAt: original, imageUrl: null,
    });
    newsRepository.update.mockImplementation(async (id, data) => ({ id, ...data }));

    await newsService.updatePost('p1', { isPublished: true });

    const data = newsRepository.update.mock.calls[0][1];
    expect(data.isPublished).toBe(true);
    expect(data.publishedAt).toBeUndefined();
  });

  it('test_should_remove_image_and_delete_s3_object', async () => {
    const imageUrl = 'https://bucket.s3.us-east-1.amazonaws.com/news-images/old.png';
    newsRepository.findById.mockResolvedValue({
      id: 'p1', title: 't', isPublished: true, publishedAt: new Date(), imageUrl,
    });
    newsRepository.update.mockImplementation(async (id, data) => ({ id, ...data }));

    await newsService.updatePost('p1', { imageS3Key: null });

    expect(newsRepository.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ imageUrl: null }),
    );
    expect(s3.deleteObject).toHaveBeenCalledWith('news-images/old.png');
  });

  it('test_should_reject_unknown_post', async () => {
    newsRepository.findById.mockResolvedValue(null);
    await expect(
      newsService.updatePost('nope', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(newsRepository.update).not.toHaveBeenCalled();
  });
});

describe('deletePost', () => {
  it('test_should_delete_post_and_its_image', async () => {
    const imageUrl = 'https://bucket.s3.us-east-1.amazonaws.com/news-images/img.webp';
    newsRepository.findById.mockResolvedValue({ id: 'p1', title: 't', imageUrl });
    newsRepository.remove.mockResolvedValue({ id: 'p1', title: 't' });

    await newsService.deletePost('p1');

    expect(newsRepository.remove).toHaveBeenCalledWith('p1');
    expect(s3.deleteObject).toHaveBeenCalledWith('news-images/img.webp');
  });

  it('test_should_reject_unknown_post_on_delete', async () => {
    newsRepository.findById.mockResolvedValue(null);
    await expect(newsService.deletePost('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(newsRepository.remove).not.toHaveBeenCalled();
  });
});

describe('generateNewsImageUploadUrl', () => {
  it('test_should_presign_with_namespaced_key_and_unconfirmed_tag', async () => {
    s3.generateUploadUrl.mockResolvedValue('https://signed-url');

    const result = await newsService.generateNewsImageUploadUrl({
      mimeType: 'image/webp',
      fileSize: 1024,
    });

    expect(result.uploadUrl).toBe('https://signed-url');
    expect(result.s3Key).toMatch(/^news-images\/[0-9a-f-]+\.webp$/);
    expect(s3.generateUploadUrl).toHaveBeenCalledWith(
      result.s3Key,
      'image/webp',
      expect.objectContaining({ contentLength: 1024, tagging: 'status=unconfirmed' }),
    );
  });

  it('test_should_reject_disallowed_mime_type', async () => {
    await expect(
      newsService.generateNewsImageUploadUrl({ mimeType: 'image/gif', fileSize: 10 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('test_should_reject_oversized_file', async () => {
    await expect(
      newsService.generateNewsImageUploadUrl({
        mimeType: 'image/png',
        fileSize: 6 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
