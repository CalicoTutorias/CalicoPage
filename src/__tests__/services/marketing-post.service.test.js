/**
 * Unit tests for src/lib/services/marketing-post.service.js
 * The S3-backed repository is mocked at the module boundary so the real
 * validation/sorting logic runs.
 */

jest.mock('@/lib/repositories/marketing-post.repository');

const repo = require('@/lib/repositories/marketing-post.repository');
const service = require('@/lib/services/marketing-post.service');

function manifest(slug, overrides = {}) {
  return {
    version: 1,
    slug,
    title: `Post ${slug}`,
    format: 'carrusel',
    caption: 'Texto del post\ncalico-tutorias.com',
    createdAt: '2026-09-15T10:00:00.000Z',
    publishedAt: '2026-09-15T12:00:00.000Z',
    files: [
      { name: '01.png', width: 1080, height: 1350 },
      { name: '02.png', width: 1080, height: 1350 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.getFileUrl.mockImplementation(async (slug, name) => `https://signed/${slug}/${name}`);
});

describe('listPosts', () => {
  it('test_should_return_valid_posts_newest_first_with_cover', async () => {
    repo.listSlugs.mockResolvedValue(['viejo', 'nuevo']);
    repo.findManifest.mockImplementation(async (slug) => (slug === 'viejo'
      ? manifest(slug, { publishedAt: '2026-01-01T00:00:00.000Z' })
      : manifest(slug)));

    const posts = await service.listPosts();

    expect(posts.map((p) => p.slug)).toEqual(['nuevo', 'viejo']);
    expect(posts[0]).toMatchObject({
      title: 'Post nuevo',
      format: 'carrusel',
      slideCount: 2,
      cover: { name: '01.png', width: 1080, height: 1350, url: 'https://signed/nuevo/01.png' },
    });
  });

  it('test_should_skip_folders_without_manifest_or_with_invalid_one', async () => {
    repo.listSlugs.mockResolvedValue(['ok', 'sin-manifest', 'roto', 'formato-malo', 'Mal_Slug']);
    repo.findManifest.mockImplementation(async (slug) => {
      if (slug === 'sin-manifest') return null;
      if (slug === 'roto') throw new SyntaxError('Unexpected token');
      if (slug === 'formato-malo') return manifest(slug, { format: 'tiktok' });
      return manifest(slug);
    });

    const posts = await service.listPosts();

    expect(posts.map((p) => p.slug)).toEqual(['ok']);
    // Invalid slug never reaches S3
    expect(repo.findManifest).not.toHaveBeenCalledWith('Mal_Slug');
  });

  it('test_should_skip_manifest_whose_slug_does_not_match_its_folder', async () => {
    repo.listSlugs.mockResolvedValue(['carpeta-a']);
    repo.findManifest.mockResolvedValue(manifest('carpeta-b'));

    expect(await service.listPosts()).toEqual([]);
  });
});

function presentacion(slug, overrides = {}) {
  return manifest(slug, {
    format: 'presentacion',
    files: [
      { name: '01.png', width: 1920, height: 1080 },
      { name: '02.png', width: 1920, height: 1080 },
    ],
    document: { name: 'presentacion.pdf', pages: 2 },
    ...overrides,
  });
}

describe('presentations', () => {
  it('test_should_accept_presentation_with_pdf_document', async () => {
    repo.listSlugs.mockResolvedValue(['repaso']);
    repo.findManifest.mockResolvedValue(presentacion('repaso'));

    const [post] = await service.listPosts();

    expect(post).toMatchObject({ format: 'presentacion', slideCount: 2, hasDocument: true });
  });

  it('test_should_reject_presentation_without_document_and_document_on_other_formats', async () => {
    repo.listSlugs.mockResolvedValue(['sin-pdf', 'carrusel-con-pdf', 'pdf-mal-nombre']);
    repo.findManifest.mockImplementation(async (slug) => {
      if (slug === 'sin-pdf') return presentacion(slug, { document: undefined });
      if (slug === 'carrusel-con-pdf') return manifest(slug, { document: { name: 'presentacion.pdf', pages: 2 } });
      return presentacion(slug, { document: { name: '../x.pdf', pages: 2 } });
    });

    expect(await service.listPosts()).toEqual([]);
  });

  it('test_should_return_document_in_detail', async () => {
    repo.findManifest.mockResolvedValue(presentacion('repaso'));
    const post = await service.getPost('repaso');
    expect(post.document).toEqual({ name: 'presentacion.pdf', pages: 2 });
  });

  it('test_should_serve_listed_pdf_with_content_type_and_nothing_else', async () => {
    repo.findManifest.mockResolvedValue(presentacion('repaso'));
    repo.getFile.mockResolvedValue({ body: 'stream' });

    await expect(service.getPostFile('repaso', 'presentacion.pdf'))
      .resolves.toEqual({ body: 'stream', contentType: 'application/pdf' });
    await expect(service.getPostFile('repaso', 'otro.pdf')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('getPost', () => {
  it('test_should_return_caption_and_signed_url_per_file', async () => {
    repo.findManifest.mockResolvedValue(manifest('mi-post'));

    const post = await service.getPost('mi-post');

    expect(post.caption).toContain('calico-tutorias.com');
    expect(post.files).toEqual([
      { name: '01.png', width: 1080, height: 1350, url: 'https://signed/mi-post/01.png' },
      { name: '02.png', width: 1080, height: 1350, url: 'https://signed/mi-post/02.png' },
    ]);
  });

  it('test_should_reject_path_traversal_slug', async () => {
    await expect(service.getPost('../news-images')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.findManifest).not.toHaveBeenCalled();
  });

  it('test_should_throw_not_found_when_manifest_missing', async () => {
    repo.findManifest.mockResolvedValue(null);
    await expect(service.getPost('no-existe')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('getPostFile', () => {
  it('test_should_stream_a_file_listed_in_the_manifest', async () => {
    repo.findManifest.mockResolvedValue(manifest('mi-post'));
    repo.getFile.mockResolvedValue({ body: 'stream' });

    await expect(service.getPostFile('mi-post', '02.png')).resolves.toEqual({ body: 'stream', contentType: 'image/png' });
    expect(repo.getFile).toHaveBeenCalledWith('mi-post', '02.png');
  });

  it('test_should_not_serve_the_manifest_or_unlisted_files', async () => {
    repo.findManifest.mockResolvedValue(manifest('mi-post'));

    await expect(service.getPostFile('mi-post', 'manifest.json')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.getPostFile('mi-post', '09.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.getFile).not.toHaveBeenCalled();
  });
});

describe('deletePost', () => {
  it('test_should_remove_all_objects_and_return_title', async () => {
    repo.findManifest.mockResolvedValue(manifest('mi-post'));
    repo.removeAll.mockResolvedValue(3);

    await expect(service.deletePost('mi-post')).resolves.toEqual({ slug: 'mi-post', title: 'Post mi-post', removed: 3 });
    expect(repo.removeAll).toHaveBeenCalledWith('mi-post');
  });

  it('test_should_not_delete_when_post_does_not_exist', async () => {
    repo.findManifest.mockResolvedValue(null);
    await expect(service.deletePost('no-existe')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.removeAll).not.toHaveBeenCalled();
  });
});
