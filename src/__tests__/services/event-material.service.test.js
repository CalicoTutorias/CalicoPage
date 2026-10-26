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
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { EVENT_MATERIAL_UPLOAD: 'EVENT_MATERIAL_UPLOAD', EVENT_MATERIAL_DELETE: 'EVENT_MATERIAL_DELETE' },
  logAction: jest.fn(),
}));

const s3 = require('@/lib/s3');
const eventRepo = require('@/lib/repositories/event.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');
const materialRepo = require('@/lib/repositories/event-material.repository');
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
      createdAt: material().createdAt, downloadUrl: 'https://s3.example/get',
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
