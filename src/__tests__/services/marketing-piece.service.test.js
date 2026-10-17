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
    expect(repo.uploadUrl).toHaveBeenCalledWith('marketing-pieces/repaso-ip/src/img/a.webp', 'image/webp', 42, 900);
  });
});

describe('edited reels (video sources)', () => {
  const MB = 1024 * 1024;
  const reel = (files) => body({ type: 'reel-editado', style: 'editorial-foto', files });

  it('test_should_save_clips_and_the_edit_of_an_edited_reel', async () => {
    repo.findPiece.mockResolvedValue(null);
    repo.createPiece.mockResolvedValue({ version: 1 });
    const files = [
      file('index.html', 100), file('video/fuente/01-intro.mp4', 40 * MB), file('video/edicion.json', 100),
      file('video/composicion.html', 100), file('video/transcripcion.json', 100), file('video/caras.json', 100),
    ];
    repo.head.mockImplementation(async (key) => ({ contentLength: files.find((f) => key.endsWith(f.path)).size }));

    await expect(service.savePiece('pomodoro', reel(files), ACTOR)).resolves.toMatchObject({ created: true });
    expect(repo.createPiece).toHaveBeenCalledWith(expect.objectContaining({ type: 'reel-editado' }));
  });

  it.each([
    ['the phone originals (only the 1080p copies are stored)', [file('index.html'), file('video/crudo/01.mp4')]],
    ['an image over 15 MB', [file('index.html'), file('img/foto.jpg', 16 * MB)]],
    ['a clip over 1 GB', [file('index.html'), file('video/fuente/01.mp4', 1025 * MB)]],
    ['other files under video/', [file('index.html'), file('video/notas.txt')]],
  ])('test_should_reject_%s', async (_label, files) => {
    await expect(service.savePiece('pomodoro', reel(files), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.head).not.toHaveBeenCalled();
  });

  it('test_should_sign_clip_uploads_as_mp4_for_one_hour', async () => {
    const [upload] = await service.requestUploads('pomodoro', { files: [{ path: 'video/fuente/01-intro.mp4', size: 40 * MB }] });
    expect(upload.contentType).toBe('video/mp4');
    expect(repo.uploadUrl).toHaveBeenCalledWith('marketing-pieces/pomodoro/src/video/fuente/01-intro.mp4', 'video/mp4', 40 * MB, 3600);
    await expect(service.requestUploads('pomodoro', { files: [{ path: 'video/fuente/01.mp4', size: 1025 * MB }] }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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

  it('test_should_keep_reel_script_and_cover_alt_in_the_published_manifest', async () => {
    repo.listKeys.mockResolvedValue([]);
    const reel = manifest({
      format: 'reel',
      document: undefined,
      files: [{ name: 'portada.png', width: 1080, height: 1920 }],
      script: '| 0–3 s | Gancho |',
      coverAlt: 'Fondo naranja con el gato de Calico',
    });

    await service.publishPiece('repaso-ip', { manifest: reel, sizes: { 'portada.png': 100 } }, ACTOR);

    expect(repo.putJson).toHaveBeenCalledWith('marketing-posts/repaso-ip/manifest.json', expect.objectContaining({
      caption: 'Repasa en calico-tutorias.com',
      script: '| 0–3 s | Gancho |',
      coverAlt: 'Fondo naranja con el gato de Calico',
    }));
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

  const video = (overrides = {}) => manifest({
    format: 'video',
    files: [{ name: 'portada.png', width: 1080, height: 1920 }],
    document: undefined,
    video: { name: 'reel.mp4', width: 1080, height: 1920, duration: 21.6 },
    ...overrides,
  });

  it('test_should_publish_a_video_reel_with_its_mp4_and_cover', async () => {
    repo.listKeys.mockResolvedValue([]);
    await expect(service.publishPiece('repaso-ip', { manifest: video(), sizes: { 'portada.png': 100, 'reel.mp4': 100 } }, ACTOR))
      .resolves.toMatchObject({ files: 2 });
    expect(repo.head).toHaveBeenCalledWith('marketing-posts/repaso-ip/reel.mp4');
  });

  it.each([
    ['video format without the mp4', video({ video: undefined })],
    ['mp4 on another format', manifest({ video: { name: 'reel.mp4', width: 1080, height: 1920, duration: 20 } })],
  ])('test_should_reject_%s', async (_label, m) => {
    await expect(service.publishPiece('repaso-ip', { manifest: m, sizes: { ...sizes, 'portada.png': 1, 'reel.mp4': 1 } }, ACTOR))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.putJson).not.toHaveBeenCalled();
  });

  it('test_should_sign_publish_uploads_for_the_mp4_up_to_300_mb', async () => {
    const MB = 1024 * 1024;
    const [upload] = await service.requestPublishUploads('repaso-ip', { files: [{ name: 'reel.mp4', size: 300 * MB }] });
    expect(upload.contentType).toBe('video/mp4');
    await expect(service.requestPublishUploads('repaso-ip', { files: [{ name: 'reel.mp4', size: 301 * MB }] }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.requestPublishUploads('repaso-ip', { files: [{ name: 'portada.png', size: 31 * MB }] }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('test_should_only_sign_publish_uploads_for_png_and_pdf', async () => {
    await expect(service.requestPublishUploads('repaso-ip', { files: [{ name: 'manifest.json', size: 10 }] }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const [upload] = await service.requestPublishUploads('repaso-ip', { files: [{ name: 'presentacion.pdf', size: 10 }] });
    expect(upload.contentType).toBe('application/pdf');
  });
});
