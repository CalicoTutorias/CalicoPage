/**
 * Unit tests for src/lib/services/marketing-piece.service.js
 * The repository (Prisma + S3) is mocked; key helpers keep their real shape.
 */

jest.mock('@/lib/repositories/marketing-piece.repository', () => ({
  srcKey: (slug, path) => `marketing-pieces/${slug}/src/${path}`,
  postKey: (slug, name) => `marketing-posts/${slug}/${name}`,
  listPieces: jest.fn(),
  findPiece: jest.fn(),
  createPiece: jest.fn(),
  updatePieceIfVersion: jest.fn(),
  markPublished: jest.fn(),
  deletePieceRow: jest.fn(),
  uploadUrl: jest.fn(),
  downloadUrl: jest.fn(),
  head: jest.fn(),
  listKeys: jest.fn(),
  removeKeys: jest.fn(),
  putJson: jest.fn(),
}));

const repo = require('@/lib/repositories/marketing-piece.repository');
const service = require('@/lib/services/marketing-piece.service');

const ACTOR = { sub: 'u-1', name: 'Felipe' };
const SHA = 'f'.repeat(64);
const file = (path, size = 10) => ({ path, size, sha256: SHA });

function body(overrides = {}) {
  return {
    baseVersion: 0,
    title: 'Repaso IP',
    type: 'presentacion',
    style: 'infografia',
    caption: 'Repasa en calico-tutorias.com',
    meta: { tema: 'IP', historial: [] },
    files: [file('index.html', 100), file('img/foto.jpg', 2000)],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.head.mockImplementation(async (key) => ({ contentLength: key.endsWith('foto.jpg') ? 2000 : 100 }));
  repo.listKeys.mockResolvedValue([]);
  repo.removeKeys.mockResolvedValue();
  repo.uploadUrl.mockImplementation(async (key) => `https://put/${key}`);
  repo.downloadUrl.mockImplementation(async (key) => `https://get/${key}`);
});

describe('savePiece', () => {
  it('test_should_create_when_base_version_is_zero', async () => {
    repo.findPiece.mockResolvedValue(null);
    repo.createPiece.mockResolvedValue({ version: 1 });

    await expect(service.savePiece('repaso-ip', body(), ACTOR)).resolves.toEqual({ slug: 'repaso-ip', version: 1, created: true });
    expect(repo.createPiece).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'repaso-ip', createdById: 'u-1', updatedById: 'u-1', type: 'presentacion',
    }));
  });

  it('test_should_conflict_when_creating_an_existing_slug', async () => {
    repo.findPiece.mockResolvedValue({ version: 4 });
    await expect(service.savePiece('repaso-ip', body(), ACTOR)).rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 4 });
    expect(repo.createPiece).not.toHaveBeenCalled();
  });

  it('test_should_update_with_optimistic_lock_and_bump_version', async () => {
    repo.updatePieceIfVersion.mockResolvedValue(1);
    await expect(service.savePiece('repaso-ip', body({ baseVersion: 3 }), ACTOR)).resolves.toEqual({ slug: 'repaso-ip', version: 4, created: false });
    expect(repo.updatePieceIfVersion).toHaveBeenCalledWith('repaso-ip', 3, expect.objectContaining({ updatedById: 'u-1' }));
  });

  it('test_should_conflict_when_someone_saved_first', async () => {
    repo.updatePieceIfVersion.mockResolvedValue(0);
    repo.findPiece.mockResolvedValue({ version: 5 });
    await expect(service.savePiece('repaso-ip', body({ baseVersion: 3 }), ACTOR)).rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 5 });
  });

  it('test_should_refuse_files_that_were_not_uploaded_or_differ_in_size', async () => {
    repo.head.mockImplementation(async (key) => {
      if (key.endsWith('foto.jpg')) { const e = new Error('nf'); e.code = 'NOT_FOUND'; throw e; }
      return { contentLength: 99 };
    });
    await expect(service.savePiece('repaso-ip', body(), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.createPiece).not.toHaveBeenCalled();
  });

  it('test_should_delete_source_files_no_longer_listed', async () => {
    repo.updatePieceIfVersion.mockResolvedValue(1);
    repo.listKeys.mockResolvedValue([
      'marketing-pieces/repaso-ip/src/index.html',
      'marketing-pieces/repaso-ip/src/img/foto.jpg',
      'marketing-pieces/repaso-ip/src/img/vieja.png',
    ]);
    await service.savePiece('repaso-ip', body({ baseVersion: 1 }), ACTOR);
    expect(repo.listKeys).toHaveBeenCalledWith('marketing-pieces/repaso-ip/src/');
    expect(repo.removeKeys).toHaveBeenCalledWith(['marketing-pieces/repaso-ip/src/img/vieja.png']);
  });

  it.each([
    ['path traversal', { files: [file('index.html'), file('../x.html')] }],
    ['files outside img/', { files: [file('index.html'), file('script.js')] }],
    ['missing index.html', { files: [file('img/a.png')] }],
    ['repeated paths', { files: [file('index.html'), file('index.html')] }],
    ['unknown type', { type: 'tiktok' }],
    ['empty title', { title: '  ' }],
  ])('test_should_reject_%s', async (_label, overrides) => {
    await expect(service.savePiece('repaso-ip', body(overrides), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.head).not.toHaveBeenCalled();
  });

  it('test_should_reject_invalid_slug', async () => {
    await expect(service.savePiece('../otro', body(), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('getPiece and requestUploads', () => {
  it('test_should_return_a_download_url_per_source_file', async () => {
    repo.findPiece.mockResolvedValue({
      slug: 'repaso-ip', title: 'Repaso', type: 'presentacion', version: 2,
      caption: 'c', meta: {}, files: [file('index.html')], createdBy: { name: 'Felipe' },
    });
    const piece = await service.getPiece('repaso-ip');
    expect(piece.createdBy).toBe('Felipe');
    expect(piece.files[0].url).toBe('https://get/marketing-pieces/repaso-ip/src/index.html');
  });

  it('test_should_sign_upload_urls_with_content_type_and_size', async () => {
    const uploads = await service.requestUploads('repaso-ip', { files: [{ path: 'img/a.webp', size: 42 }] });
    expect(uploads).toEqual([{ path: 'img/a.webp', contentType: 'image/webp', url: 'https://put/marketing-pieces/repaso-ip/src/img/a.webp' }]);
    expect(repo.uploadUrl).toHaveBeenCalledWith('marketing-pieces/repaso-ip/src/img/a.webp', 'image/webp', 42);
  });
});

describe('publishPiece', () => {
  const manifest = (overrides = {}) => ({
    version: 1,
    slug: 'repaso-ip',
    title: 'Repaso IP',
    format: 'presentacion',
    caption: 'Repasa en calico-tutorias.com',
    files: [{ name: '01.png', width: 1920, height: 1080 }],
    document: { name: 'presentacion.pdf', pages: 1 },
    ...overrides,
  });
  const sizes = { '01.png': 100, 'presentacion.pdf': 100 };

  beforeEach(() => {
    repo.findPiece.mockResolvedValue({ version: 1 });
    repo.head.mockResolvedValue({ contentLength: 100 });
  });

  it('test_should_write_manifest_last_and_remove_leftovers', async () => {
    repo.listKeys.mockResolvedValue([
      'marketing-posts/repaso-ip/01.png',
      'marketing-posts/repaso-ip/02.png',
      'marketing-posts/repaso-ip/presentacion.pdf',
      'marketing-posts/repaso-ip/manifest.json',
    ]);
    const order = [];
    repo.removeKeys.mockImplementation(async () => order.push('remove'));
    repo.putJson.mockImplementation(async () => order.push('manifest'));

    await service.publishPiece('repaso-ip', { manifest: manifest(), sizes }, ACTOR);

    expect(repo.removeKeys).toHaveBeenCalledWith(['marketing-posts/repaso-ip/02.png']);
    expect(repo.putJson).toHaveBeenCalledWith('marketing-posts/repaso-ip/manifest.json', expect.objectContaining({ publishedAt: expect.any(String) }));
    expect(order).toEqual(['remove', 'manifest']);
    expect(repo.markPublished).toHaveBeenCalledWith('repaso-ip', 'u-1', expect.any(Date));
  });

  it.each([
    ['slug mismatch', { manifest: manifest({ slug: 'otro' }), sizes }],
    ['caption without the URL', { manifest: manifest({ caption: 'sin url' }), sizes }],
    ['presentation without PDF', { manifest: manifest({ document: undefined }), sizes }],
    ['missing sizes', { manifest: manifest() }],
  ])('test_should_reject_%s', async (_label, input) => {
    await expect(service.publishPiece('repaso-ip', input, ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.putJson).not.toHaveBeenCalled();
  });

  it('test_should_not_publish_when_a_file_is_missing', async () => {
    repo.head.mockImplementation(async (key) => {
      if (key.endsWith('.pdf')) { const e = new Error('nf'); e.code = 'NOT_FOUND'; throw e; }
      return { contentLength: 100 };
    });
    await expect(service.publishPiece('repaso-ip', { manifest: manifest(), sizes }, ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.putJson).not.toHaveBeenCalled();
  });

  it('test_should_only_sign_publish_uploads_for_png_and_pdf', async () => {
    await expect(service.requestPublishUploads('repaso-ip', { files: [{ name: 'manifest.json', size: 10 }] }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const [upload] = await service.requestPublishUploads('repaso-ip', { files: [{ name: 'presentacion.pdf', size: 10 }] });
    expect(upload.contentType).toBe('application/pdf');
  });
});
