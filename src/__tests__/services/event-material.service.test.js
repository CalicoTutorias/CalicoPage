/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/event-material.service.js: the S3 key
 * layout, the admin upload (presign → register) and delete, and the student
 * gate (Confirmed + survey answered → short-lived presigned download). S3,
 * repositories and audit are mocked; the shared rules in
 * src/lib/events/event-materials.js are REAL.
 */

jest.mock('@/lib/s3', () => ({
  generateUploadUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
  headObject: jest.fn(),
  setObjectTags: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock('@/lib/repositories/event.repository', () => ({ findById: jest.fn(), findBySlug: jest.fn() }));
jest.mock('@/lib/repositories/event-registration.repository', () => ({ findViewerRegistration: jest.fn() }));
jest.mock('@/lib/repositories/event-material.repository', () => ({
  create: jest.fn(),
  findByEvent: jest.fn(),
  findForEvent: jest.fn(),
  countByEvent: jest.fn(),
  deleteById: jest.fn(),
}));
jest.mock('@/lib/repositories/marketing-post.repository', () => ({ getFileUrl: jest.fn(), headFile: jest.fn() }));
jest.mock('@/lib/services/marketing-post.service', () => ({ getPostDocument: jest.fn() }));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { EVENT_MATERIAL_UPLOAD: 'EVENT_MATERIAL_UPLOAD', EVENT_MATERIAL_DELETE: 'EVENT_MATERIAL_DELETE' },
  logAction: jest.fn(),
}));

const s3 = require('@/lib/s3');
const eventRepo = require('@/lib/repositories/event.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');
const materialRepo = require('@/lib/repositories/event-material.repository');
const postRepo = require('@/lib/repositories/marketing-post.repository');
const postService = require('@/lib/services/marketing-post.service');
const audit = require('@/lib/services/admin-audit.service');
const service = require('@/lib/services/event-material.service');

const ADMIN = 'admin-1';
const ID = 'evt-1';
const SLUG = 'repaso-eda-parcial-2-ab12';
// 2026-11-06 01:00 UTC = 2026-11-05 20:00 in Bogotá: the folder uses the Bogotá date.
const START = new Date('2026-11-06T01:00:00.000Z');
const FOLDER = `event-materials/isis1225/2026-11-05_${SLUG}/`;
const KEY = `${FOLDER}guia-de-ejercicios-a1b2c3.pdf`;
const MB = 1024 * 1024;

const err = (code, extra = {}) => expect.objectContaining({ code, ...extra });

function event(overrides = {}) {
  return {
    id: ID,
    slug: SLUG,
    status: 'Published',
    startsAt: START,
    course: { id: 'c1', name: 'Estructuras de Datos y Algoritmos', code: 'ISIS1225' },
    ...overrides,
  };
}

function material(overrides = {}) {
  return {
    id: 'm1',
    eventId: ID,
    s3Key: KEY,
    fileName: 'Guía de ejercicios.pdf',
    mimeType: 'application/pdf',
    fileSize: 2 * MB,
    createdById: ADMIN,
    createdAt: new Date('2026-11-06T03:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  eventRepo.findById.mockResolvedValue(event());
  eventRepo.findBySlug.mockResolvedValue(event());
  materialRepo.countByEvent.mockResolvedValue(0);
  s3.generateUploadUrl.mockResolvedValue('https://s3.example/put');
  s3.generateDownloadUrl.mockResolvedValue('https://s3.example/get');
  s3.setObjectTags.mockResolvedValue();
  s3.deleteObject.mockResolvedValue();
});

describe('eventMaterialFolder', () => {
  it('groups by course code, then Bogotá start date + slug', () => {
    expect(service.eventMaterialFolder(event())).toBe(FOLDER);
  });

  it('uses sin-materia when the event has no course', () => {
    expect(service.eventMaterialFolder(event({ course: null }))).toBe(`event-materials/sin-materia/2026-11-05_${SLUG}/`);
  });
});

describe('generateMaterialUploadUrl', () => {
  it('signs a PUT under the event folder with a key-safe name, the extension\'s Content-Type, the exact size and the unconfirmed tag', async () => {
    const result = await service.generateMaterialUploadUrl({ eventId: ID, fileName: 'Guía de Ejercicios #2.PDF', fileSize: 3 * MB });

    expect(result.contentType).toBe('application/pdf');
    expect(result.uploadUrl).toBe('https://s3.example/put');
    expect(result.s3Key).toMatch(new RegExp(`^${FOLDER}guia-de-ejercicios-2-[0-9a-f]{6}\\.pdf$`));
    expect(s3.generateUploadUrl).toHaveBeenCalledWith(result.s3Key, 'application/pdf', {
      expiresIn: 900, contentLength: 3 * MB, tagging: 'status=unconfirmed',
    });
  });

  it('accepts code and notebooks whatever the browser says their type is', async () => {
    const py = await service.generateMaterialUploadUrl({ eventId: ID, fileName: 'arbol_avl.py', fileSize: 2000 });
    const nb = await service.generateMaterialUploadUrl({ eventId: ID, fileName: 'taller.ipynb', fileSize: 2000 });
    expect(py.contentType).toBe('text/x-python');
    expect(nb.contentType).toBe('application/x-ipynb+json');
  });

  it.each([
    ['an executable', { fileName: 'virus.exe', fileSize: 10 }, 'MATERIAL_TYPE_INVALID'],
    ['a file without extension', { fileName: 'README', fileSize: 10 }, 'MATERIAL_TYPE_INVALID'],
    ['a file over 100 MB', { fileName: 'clase.pdf', fileSize: 100 * MB + 1 }, 'MATERIAL_TOO_LARGE'],
    ['an empty file', { fileName: 'clase.pdf', fileSize: 0 }, 'MATERIAL_SIZE_INVALID'],
  ])('refuses %s', async (_label, file, rule) => {
    await expect(service.generateMaterialUploadUrl({ eventId: ID, ...file })).rejects.toEqual(err('VALIDATION_ERROR', { rule }));
    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses the 31st file, a Draft or Canceled event and an unknown one', async () => {
    materialRepo.countByEvent.mockResolvedValue(30);
    await expect(service.generateMaterialUploadUrl({ eventId: ID, fileName: 'a.pdf', fileSize: 10 }))
      .rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_LIMIT' }));

    for (const status of ['Draft', 'Canceled']) {
      eventRepo.findById.mockResolvedValue(event({ status }));
      await expect(service.generateMaterialUploadUrl({ eventId: ID, fileName: 'a.pdf', fileSize: 10 }))
        .rejects.toEqual(err('INVALID_STATE'));
    }

    eventRepo.findById.mockResolvedValue(null);
    await expect(service.generateMaterialUploadUrl({ eventId: ID, fileName: 'a.pdf', fileSize: 10 }))
      .rejects.toEqual(err('NOT_FOUND'));
    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
  });
});

describe('registerMaterial', () => {
  beforeEach(() => {
    s3.headObject.mockResolvedValue({ contentLength: 2 * MB, contentType: 'application/pdf' });
    materialRepo.create.mockImplementation(async (data) => ({ id: 'm1', createdAt: new Date(), ...data }));
  });

  it('stores the row with the size S3 reports, confirms the tag and audits', async () => {
    const result = await service.registerMaterial({ adminId: ADMIN, eventId: ID, s3Key: KEY, fileName: 'Guía de ejercicios.pdf', request: null });

    expect(s3.headObject).toHaveBeenCalledWith(KEY);
    expect(materialRepo.create).toHaveBeenCalledWith({
      eventId: ID, s3Key: KEY, fileName: 'Guía de ejercicios.pdf', mimeType: 'application/pdf', fileSize: 2 * MB, createdById: ADMIN,
    });
    expect(s3.setObjectTags).toHaveBeenCalledWith(KEY, { status: 'confirmed' });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EVENT_MATERIAL_UPLOAD', targetType: 'Event', targetId: ID,
      payload: expect.objectContaining({ materialId: 'm1', s3Key: KEY }),
    }));
    expect(result).toEqual(expect.objectContaining({ id: 'm1', fileName: 'Guía de ejercicios.pdf', fileSize: 2 * MB }));
    expect(result).not.toHaveProperty('s3Key');
  });

  it('accepts a key from the event folder even if the event date changed since the presign', async () => {
    const moved = `event-materials/isis1225/2026-11-01_${SLUG}/guia-a1b2c3.pdf`;
    await service.registerMaterial({ adminId: ADMIN, eventId: ID, s3Key: moved, fileName: 'guia.pdf' });
    expect(materialRepo.create).toHaveBeenCalledWith(expect.objectContaining({ s3Key: moved }));
  });

  it.each([
    ['another event\'s folder', 'event-materials/isis1225/2026-11-05_otro-repaso-zz99/guia-a1b2c3.pdf'],
    ['another prefix', `event-images/${SLUG}/guia.pdf`],
    ['a path traversal', `${FOLDER}../../x/guia.pdf`],
    ['a nested path', `${FOLDER}sub/guia.pdf`],
  ])('refuses a key in %s', async (_label, s3Key) => {
    await expect(service.registerMaterial({ adminId: ADMIN, eventId: ID, s3Key, fileName: 'guia.pdf' }))
      .rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_KEY_INVALID' }));
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('refuses a name whose extension differs from the uploaded file, and a key never uploaded', async () => {
    await expect(service.registerMaterial({ adminId: ADMIN, eventId: ID, s3Key: KEY, fileName: 'guia.exe' }))
      .rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_NAME_REQUIRED' }));

    s3.headObject.mockRejectedValue(Object.assign(new Error('missing'), { code: 'NOT_FOUND' }));
    await expect(service.registerMaterial({ adminId: ADMIN, eventId: ID, s3Key: KEY, fileName: 'guia.pdf' }))
      .rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_NOT_UPLOADED' }));
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate key to MATERIAL_DUPLICATE', async () => {
    materialRepo.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.registerMaterial({ adminId: ADMIN, eventId: ID, s3Key: KEY, fileName: 'guia.pdf' }))
      .rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_DUPLICATE' }));
  });
});

describe('admin list and delete', () => {
  it('lists in upload order with a 15-minute attachment download URL', async () => {
    materialRepo.findByEvent.mockResolvedValue([material()]);

    const [item] = await service.listMaterialsAdmin(ID);

    expect(materialRepo.findByEvent).toHaveBeenCalledWith(ID);
    expect(s3.generateDownloadUrl).toHaveBeenCalledWith(KEY, 900, { downloadName: 'Guia de ejercicios.pdf' });
    expect(item).toEqual({
      id: 'm1', fileName: 'Guía de ejercicios.pdf', mimeType: 'application/pdf', fileSize: 2 * MB,
      url: null, createdAt: material().createdAt, postSlug: null, downloadUrl: 'https://s3.example/get',
    });
  });

  it('deletes the row, then the object, and audits; an S3 failure does not fail the delete', async () => {
    materialRepo.findForEvent.mockResolvedValue(material());
    s3.deleteObject.mockRejectedValue(new Error('S3 down'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(service.deleteMaterial({ adminId: ADMIN, eventId: ID, materialId: 'm1' })).resolves.toEqual({ id: 'm1' });

    expect(materialRepo.findForEvent).toHaveBeenCalledWith(ID, 'm1');
    expect(materialRepo.deleteById).toHaveBeenCalledWith('m1');
    expect(materialRepo.deleteById.mock.invocationCallOrder[0]).toBeLessThan(s3.deleteObject.mock.invocationCallOrder[0]);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_MATERIAL_DELETE' }));
    console.warn.mockRestore();
  });

  it('404s a material of another event', async () => {
    materialRepo.findForEvent.mockResolvedValue(null);
    await expect(service.deleteMaterial({ adminId: ADMIN, eventId: ID, materialId: 'm9' })).rejects.toEqual(err('NOT_FOUND'));
    expect(materialRepo.deleteById).not.toHaveBeenCalled();
  });
});

describe('material from a post', () => {
  const POST_KEY = 'marketing-posts/repaso-ip/presentacion.pdf';
  const postMaterial = (overrides = {}) => material({
    postSlug: 'repaso-ip', s3Key: POST_KEY, fileName: 'Repaso IP Nivel 3.pdf', fileSize: 1877426, ...overrides,
  });
  const attach = () => service.attachPostDocument({ adminId: ADMIN, eventId: ID, postSlug: 'repaso-ip' });

  beforeEach(() => {
    postService.getPostDocument.mockResolvedValue({ title: 'Repaso IP Nivel 3', key: POST_KEY, size: 1877426 });
    postRepo.getFileUrl.mockResolvedValue('https://posts.example/get');
    postRepo.headFile.mockResolvedValue({ contentLength: 1877426 });
  });

  it('references the post file: nothing is uploaded, copied or re-tagged', async () => {
    materialRepo.create.mockImplementation(async (data) => ({ id: 'm1', createdAt: new Date(), ...data }));

    const created = await attach();

    expect(postService.getPostDocument).toHaveBeenCalledWith('repaso-ip');
    expect(materialRepo.create).toHaveBeenCalledWith({
      eventId: ID, postSlug: 'repaso-ip', s3Key: POST_KEY, fileName: 'Repaso IP Nivel 3.pdf',
      mimeType: 'application/pdf', fileSize: 1877426, createdById: ADMIN,
    });
    expect(created).toMatchObject({ id: 'm1', fileName: 'Repaso IP Nivel 3.pdf', postSlug: 'repaso-ip' });
    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
    expect(s3.setObjectTags).not.toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EVENT_MATERIAL_UPLOAD', payload: expect.objectContaining({ postSlug: 'repaso-ip', s3Key: POST_KEY }),
    }));
  });

  it('a slash in the title does not cut the display name', async () => {
    postService.getPostDocument.mockResolvedValue({ title: 'Repaso IP/EDA', key: POST_KEY, size: 1 });
    materialRepo.create.mockImplementation(async (data) => ({ id: 'm1', ...data }));
    await expect(attach()).resolves.toMatchObject({ fileName: 'Repaso IP-EDA.pdf' });
  });

  it('adding the same post twice to an event is a clear error', async () => {
    materialRepo.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(attach()).rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_DUPLICATE' }));
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('respects the same rules as an upload: published event and file limit', async () => {
    eventRepo.findById.mockResolvedValue(event({ status: 'Draft' }));
    await expect(attach()).rejects.toEqual(err('INVALID_STATE'));

    eventRepo.findById.mockResolvedValue(event());
    materialRepo.countByEvent.mockResolvedValue(30);
    await expect(attach()).rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_LIMIT' }));
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('a post without a PDF is passed on as not found', async () => {
    postService.getPostDocument.mockRejectedValue(Object.assign(new Error('x'), { code: 'NOT_FOUND' }));
    await expect(attach()).rejects.toEqual(err('NOT_FOUND'));
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('deleting the material leaves the file in the post', async () => {
    materialRepo.findForEvent.mockResolvedValue(postMaterial());

    await service.deleteMaterial({ adminId: ADMIN, eventId: ID, materialId: 'm1' });

    expect(materialRepo.deleteById).toHaveBeenCalledWith('m1');
    expect(s3.deleteObject).not.toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_MATERIAL_DELETE' }));
  });

  it('the admin list signs it from the post bucket and marks where it came from', async () => {
    materialRepo.findByEvent.mockResolvedValue([postMaterial()]);

    const [item] = await service.listMaterialsAdmin(ID);

    expect(postRepo.getFileUrl).toHaveBeenCalledWith('repaso-ip', 'presentacion.pdf', 900, { downloadName: 'Repaso IP Nivel 3.pdf' });
    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
    expect(item).toMatchObject({ postSlug: 'repaso-ip', downloadUrl: 'https://posts.example/get' });
  });

  describe('students', () => {
    const answered = { status: 'Confirmed', surveyResponse: { id: 's1' } };
    const download = () => service.getMaterialDownloadUrl({ slug: SLUG, userId: 'u1', materialId: 'm1' });

    beforeEach(() => {
      regRepo.findViewerRegistration.mockResolvedValue(answered);
      materialRepo.findForEvent.mockResolvedValue(postMaterial());
    });

    it('get a 5-minute link from the post bucket under the post title', async () => {
      await expect(download()).resolves.toEqual({ url: 'https://posts.example/get', fileName: 'Repaso IP Nivel 3.pdf' });
      expect(postRepo.getFileUrl).toHaveBeenCalledWith('repaso-ip', 'presentacion.pdf', 300, { downloadName: 'Repaso IP Nivel 3.pdf' });
    });

    it('the survey gate is the same as for an upload', async () => {
      regRepo.findViewerRegistration.mockResolvedValue({ status: 'Confirmed', surveyResponse: null });
      await expect(download()).rejects.toEqual(err('MATERIALS_LOCKED'));
      expect(postRepo.getFileUrl).not.toHaveBeenCalled();
    });

    it('never see the key or the post it comes from', async () => {
      materialRepo.findByEvent.mockResolvedValue([postMaterial()]);
      const list = await service.listMaterialsForStudent({ slug: SLUG, userId: 'u1' });
      expect(JSON.stringify(list)).not.toMatch(/marketing-posts|repaso-ip"/);
      expect(list[0]).not.toHaveProperty('postSlug');
    });

    it('a file that is gone answers MATERIAL_NOT_FOUND instead of a signed link to an error page', async () => {
      postRepo.headFile.mockRejectedValue(Object.assign(new Error('gone'), { code: 'NOT_FOUND' }));
      await expect(download()).rejects.toEqual(err('MATERIAL_NOT_FOUND'));
      expect(postRepo.getFileUrl).not.toHaveBeenCalled();
    });

    it('an S3 outage is not disguised as a missing file', async () => {
      postRepo.headFile.mockRejectedValue(new Error('S3 down'));
      await expect(download()).rejects.toThrow('S3 down');
    });
  });
});

describe('material that is a link', () => {
  const URL = 'https://zoom.us/rec/share/abc?pwd=1';
  const linkMaterial = (overrides = {}) => material({
    s3Key: null, url: URL, fileName: 'Grabación del repaso', mimeType: null, fileSize: null, ...overrides,
  });
  const add = (overrides = {}) => service.addMaterialLink({
    adminId: ADMIN, eventId: ID, name: 'Grabación del repaso', url: URL, ...overrides,
  });

  beforeEach(() => {
    materialRepo.create.mockImplementation(async (data) => ({ id: 'm1', createdAt: new Date(), ...data }));
  });

  it('stores the name and the URL, touches nothing in S3 and audits', async () => {
    const created = await add();

    expect(materialRepo.create).toHaveBeenCalledWith({ eventId: ID, url: URL, fileName: 'Grabación del repaso', createdById: ADMIN });
    expect(created).toMatchObject({ id: 'm1', fileName: 'Grabación del repaso', url: URL });
    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
    expect(s3.setObjectTags).not.toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EVENT_MATERIAL_UPLOAD', payload: expect.objectContaining({ materialId: 'm1', url: URL }),
    }));
  });

  it('keeps a slash in the name and trims what was pasted around the URL', async () => {
    await add({ name: '  Clase 1/2  ', url: `  ${URL}\n` });
    expect(materialRepo.create).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'Clase 1/2', url: URL }));
  });

  it.each([
    ['a script', 'javascript:alert(1)'],
    ['a script with https in it', 'javascript://https://zoom.us/%0aalert(1)'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>'],
    ['plain http', 'http://zoom.us/rec/share/abc'],
    ['no protocol', 'zoom.us/rec/share/abc'],
    ['text', 'la grabación'],
    ['nothing', ''],
    ['a URL over the limit', `https://zoom.us/${'a'.repeat(2000)}`],
  ])('refuses %s', async (_label, url) => {
    await expect(add({ url })).rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_URL_INVALID' }));
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    await expect(add({ name: '   ' })).rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_LINK_NAME_REQUIRED' }));
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('respects the same rules as a file: published event, shared limit and no duplicates', async () => {
    materialRepo.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(add()).rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_DUPLICATE' }));
    expect(audit.logAction).not.toHaveBeenCalled();

    materialRepo.countByEvent.mockResolvedValue(30);
    await expect(add()).rejects.toEqual(err('VALIDATION_ERROR', { rule: 'MATERIAL_LIMIT' }));

    eventRepo.findById.mockResolvedValue(event({ status: 'Draft' }));
    await expect(add()).rejects.toEqual(err('INVALID_STATE'));
  });

  it('deleting it removes the row and asks nothing of S3', async () => {
    materialRepo.findForEvent.mockResolvedValue(linkMaterial());

    await service.deleteMaterial({ adminId: ADMIN, eventId: ID, materialId: 'm1' });

    expect(materialRepo.deleteById).toHaveBeenCalledWith('m1');
    expect(s3.deleteObject).not.toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EVENT_MATERIAL_DELETE', payload: expect.objectContaining({ url: URL }),
    }));
  });

  it('the admin list gives the URL as it is, unsigned', async () => {
    materialRepo.findByEvent.mockResolvedValue([linkMaterial()]);
    const [item] = await service.listMaterialsAdmin(ID);
    expect(item).toMatchObject({ url: URL, downloadUrl: URL });
    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
  });

  it('a student who answered the survey gets the URL, in the list and from the download route', async () => {
    regRepo.findViewerRegistration.mockResolvedValue({ status: 'Confirmed', surveyResponse: { id: 's1' } });
    materialRepo.findByEvent.mockResolvedValue([linkMaterial()]);
    materialRepo.findForEvent.mockResolvedValue(linkMaterial());

    const [item] = await service.listMaterialsForStudent({ slug: SLUG, userId: 'u1' });
    expect(item).toMatchObject({ fileName: 'Grabación del repaso', url: URL });

    await expect(service.getMaterialDownloadUrl({ slug: SLUG, userId: 'u1', materialId: 'm1' }))
      .resolves.toEqual({ url: URL, fileName: 'Grabación del repaso' });
    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
  });

  it('a student who has not answered the survey never gets the URL', async () => {
    regRepo.findViewerRegistration.mockResolvedValue({ status: 'Confirmed', surveyResponse: null });
    materialRepo.findByEvent.mockResolvedValue([linkMaterial()]);
    materialRepo.findForEvent.mockResolvedValue(linkMaterial());

    await expect(service.listMaterialsForStudent({ slug: SLUG, userId: 'u1' })).rejects.toEqual(err('MATERIALS_LOCKED'));
    await expect(service.getMaterialDownloadUrl({ slug: SLUG, userId: 'u1', materialId: 'm1' })).rejects.toEqual(err('MATERIALS_LOCKED'));
  });
});

describe('student access', () => {
  const confirmedWithSurvey = { status: 'Confirmed', surveyResponse: { id: 's1' } };

  it('a Confirmed registrant who answered the survey lists the files (no keys) and gets a 5-minute download', async () => {
    regRepo.findViewerRegistration.mockResolvedValue(confirmedWithSurvey);
    materialRepo.findByEvent.mockResolvedValue([material()]);
    materialRepo.findForEvent.mockResolvedValue(material());

    const list = await service.listMaterialsForStudent({ slug: SLUG, userId: 'u1' });
    expect(regRepo.findViewerRegistration).toHaveBeenCalledWith(ID, 'u1');
    expect(list).toEqual([expect.objectContaining({ id: 'm1', fileName: 'Guía de ejercicios.pdf' })]);
    expect(JSON.stringify(list).includes('event-materials/')).toBe(false);

    const download = await service.getMaterialDownloadUrl({ slug: SLUG, userId: 'u1', materialId: 'm1' });
    expect(materialRepo.findForEvent).toHaveBeenCalledWith(ID, 'm1');
    expect(s3.generateDownloadUrl).toHaveBeenCalledWith(KEY, 300, { downloadName: 'Guia de ejercicios.pdf' });
    expect(download).toEqual({ url: 'https://s3.example/get', fileName: 'Guía de ejercicios.pdf' });
  });

  it.each([
    ['not registered', null],
    ['Confirmed without the survey', { status: 'Confirmed', surveyResponse: null }],
    ['pending approval', { status: 'PendingApproval', surveyResponse: null }],
    ['rejected after answering', { status: 'Rejected', surveyResponse: { id: 's1' } }],
    ['canceled after answering', { status: 'Canceled', surveyResponse: { id: 's1' } }],
  ])('locks the material when %s', async (_label, registration) => {
    regRepo.findViewerRegistration.mockResolvedValue(registration);

    await expect(service.listMaterialsForStudent({ slug: SLUG, userId: 'u1' })).rejects.toEqual(err('MATERIALS_LOCKED'));
    await expect(service.getMaterialDownloadUrl({ slug: SLUG, userId: 'u1', materialId: 'm1' })).rejects.toEqual(err('MATERIALS_LOCKED'));
    expect(materialRepo.findByEvent).not.toHaveBeenCalled();
    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
  });

  it('404s Draft or unknown events and materials of another event', async () => {
    eventRepo.findBySlug.mockResolvedValue(event({ status: 'Draft' }));
    await expect(service.listMaterialsForStudent({ slug: SLUG, userId: 'u1' })).rejects.toEqual(err('EVENT_NOT_FOUND'));

    eventRepo.findBySlug.mockResolvedValue(event());
    regRepo.findViewerRegistration.mockResolvedValue(confirmedWithSurvey);
    materialRepo.findForEvent.mockResolvedValue(null);
    await expect(service.getMaterialDownloadUrl({ slug: SLUG, userId: 'u1', materialId: 'm9' })).rejects.toEqual(err('MATERIAL_NOT_FOUND'));
    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
  });
});
