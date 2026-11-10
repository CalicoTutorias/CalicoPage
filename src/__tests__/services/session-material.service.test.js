/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/session-material.service.js. The rule that
 * matters: a student gets neither the names nor a download until they left a
 * review with a comment, and only the session's tutor and admins add material.
 * Repositories, S3 and audit are mocked; the file rules are REAL.
 */

jest.mock('@/lib/s3', () => ({
  generateUploadUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
  headObject: jest.fn(),
  setObjectTags: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock('@/lib/repositories/session-material.repository', () => ({
  create: jest.fn(),
  findBySession: jest.fn(),
  findForSession: jest.fn(),
  countBySession: jest.fn(),
  deleteById: jest.fn(),
}));
jest.mock('@/lib/repositories/review.repository', () => ({ findBySession: jest.fn() }));
jest.mock('@/lib/repositories/session.repository', () => ({ findById: jest.fn() }));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: {
    SESSION_MATERIAL_UPLOAD: 'SESSION_MATERIAL_UPLOAD',
    SESSION_MATERIAL_DELETE: 'SESSION_MATERIAL_DELETE',
  },
  logAction: jest.fn(),
}));

const s3 = require('@/lib/s3');
const materialRepo = require('@/lib/repositories/session-material.repository');
const reviewRepo = require('@/lib/repositories/review.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const audit = require('@/lib/services/admin-audit.service');
const service = require('@/lib/services/session-material.service');

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TUTOR = { id: 'tutor-1', isAdmin: false };
const STUDENT = { id: 'student-1', isAdmin: false };
const ADMIN = { id: 'admin-1', isAdmin: true };
const STRANGER = { id: 'stranger-1', isAdmin: false };
const KEY = `session-materials/${SESSION_ID}/guia-a1b2c3.pdf`;

const code = (expected) => expect.objectContaining({ code: expected });

function storedSession(overrides = {}) {
  return { id: SESSION_ID, tutorId: TUTOR.id, status: 'Accepted', participants: [{ studentId: STUDENT.id }], ...overrides };
}

function stored(overrides = {}) {
  return {
    id: 'm1',
    sessionId: SESSION_ID,
    s3Key: KEY,
    fileName: 'Guía.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    createdById: TUTOR.id,
    createdAt: new Date('2026-11-03T12:00:00.000Z'),
    ...overrides,
  };
}

function review(overrides = {}) {
  return { studentId: STUDENT.id, tutorId: TUTOR.id, status: 'done', rating: 5, comment: 'Muy clara', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  sessionRepo.findById.mockResolvedValue(storedSession());
  materialRepo.findBySession.mockResolvedValue([stored()]);
  materialRepo.findForSession.mockResolvedValue(stored());
  materialRepo.countBySession.mockResolvedValue(0);
  materialRepo.create.mockImplementation(async (data) => ({ id: 'm9', createdAt: new Date(), ...data }));
  reviewRepo.findBySession.mockResolvedValue([]);
  s3.generateUploadUrl.mockResolvedValue('https://s3.example/put');
  s3.generateDownloadUrl.mockResolvedValue('https://s3.example/get');
  s3.headObject.mockResolvedValue({ contentLength: 2048, contentType: 'application/pdf' });
  s3.setObjectTags.mockResolvedValue(undefined);
  s3.deleteObject.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listMaterials', () => {
  const list = (actor) => service.listMaterials({ sessionId: SESSION_ID, actor });

  it('test_should_only_tell_how_many_files_there_are_before_the_review', async () => {
    const result = await list(STUDENT);

    expect(result).toEqual({
      canManage: false, canUpload: false, locked: true, lockReason: 'REVIEW_REQUIRED', count: 1, materials: [],
    });
    expect(JSON.stringify(result)).not.toContain('Guía');
  });

  it.each([
    ['an empty placeholder', { status: 'pending', rating: null, comment: null }, 'REVIEW_REQUIRED'],
    ['a review without a comment', { comment: null }, 'COMMENT_REQUIRED'],
    ['a blank comment', { comment: '   ' }, 'COMMENT_REQUIRED'],
    ['the review of another student', { studentId: 'someone-else' }, 'REVIEW_REQUIRED'],
    ['a review of another tutor', { tutorId: 'someone-else' }, 'REVIEW_REQUIRED'],
  ])('test_should_stay_locked_with_%s', async (_label, overrides, reason) => {
    reviewRepo.findBySession.mockResolvedValue([review(overrides)]);

    const result = await list(STUDENT);

    expect(result.locked).toBe(true);
    expect(result.lockReason).toBe(reason);
    expect(result.materials).toEqual([]);
  });

  it('test_should_list_the_files_after_a_review_with_a_comment', async () => {
    reviewRepo.findBySession.mockResolvedValue([review()]);

    const result = await list(STUDENT);

    expect(result.locked).toBe(false);
    expect(result.canManage).toBe(false);
    expect(result.materials.map((m) => m.fileName)).toEqual(['Guía.pdf']);
  });

  it.each([['the tutor', TUTOR], ['an admin', ADMIN]])('test_should_let_%s_see_the_files_without_a_review', async (_label, actor) => {
    const result = await list(actor);

    expect(result.canManage).toBe(true);
    expect(result.canUpload).toBe(true);
    expect(result.materials).toHaveLength(1);
    expect(reviewRepo.findBySession).not.toHaveBeenCalled();
  });

  it('test_should_never_return_the_s3_key_or_who_uploaded_it', async () => {
    reviewRepo.findBySession.mockResolvedValue([review()]);

    for (const actor of [STUDENT, TUTOR, ADMIN]) {
      const body = JSON.stringify(await list(actor));
      expect(body).not.toContain(KEY);
      expect(body).not.toContain('createdById');
    }
  });

  it('test_should_say_who_left_each_file_and_what_can_be_removed', async () => {
    materialRepo.findBySession.mockResolvedValue([stored(), stored({ id: 'm2', createdById: ADMIN.id })]);

    const asTutor = await list(TUTOR);
    expect(asTutor.materials.map((m) => [m.uploadedByTutor, m.canDelete])).toEqual([[true, true], [false, false]]);

    const asAdmin = await list(ADMIN);
    expect(asAdmin.materials.map((m) => [m.uploadedByTutor, m.canDelete])).toEqual([[true, true], [false, true]]);
  });

  it('test_should_not_offer_upload_on_a_canceled_session', async () => {
    sessionRepo.findById.mockResolvedValue(storedSession({ status: 'Canceled' }));

    expect((await list(TUTOR)).canUpload).toBe(false);
  });

  it('test_should_refuse_someone_outside_the_session', async () => {
    await expect(list(STRANGER)).rejects.toEqual(code('FORBIDDEN'));

    expect(materialRepo.findBySession).not.toHaveBeenCalled();
  });

  it('test_should_answer_not_found_for_an_unknown_session', async () => {
    sessionRepo.findById.mockResolvedValue(null);

    await expect(list(TUTOR)).rejects.toEqual(code('SESSION_NOT_FOUND'));
  });
});

describe('getMaterialDownloadUrl', () => {
  const download = (actor, materialId = 'm1') => service.getMaterialDownloadUrl({ sessionId: SESSION_ID, materialId, actor });

  it.each([
    ['no review', []],
    ['a review without a comment', [review({ comment: null })]],
  ])('test_should_not_sign_anything_for_a_student_with_%s', async (_label, reviews) => {
    reviewRepo.findBySession.mockResolvedValue(reviews);

    await expect(download(STUDENT)).rejects.toEqual(code('MATERIALS_LOCKED'));

    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
    expect(materialRepo.findForSession).not.toHaveBeenCalled();
  });

  it('test_should_sign_a_short_lived_attachment_after_the_review', async () => {
    reviewRepo.findBySession.mockResolvedValue([review()]);

    await expect(download(STUDENT)).resolves.toEqual({ url: 'https://s3.example/get', fileName: 'Guía.pdf' });

    expect(s3.generateDownloadUrl).toHaveBeenCalledWith(KEY, 300, { downloadName: 'Guia.pdf' });
  });

  it.each([['the tutor', TUTOR], ['an admin', ADMIN]])('test_should_let_%s_download_without_a_review', async (_label, actor) => {
    await expect(download(actor)).resolves.toEqual(expect.objectContaining({ url: 'https://s3.example/get' }));
  });

  it('test_should_refuse_someone_outside_the_session', async () => {
    await expect(download(STRANGER)).rejects.toEqual(code('FORBIDDEN'));

    expect(s3.generateDownloadUrl).not.toHaveBeenCalled();
  });

  it('test_should_answer_not_found_for_a_material_of_another_session', async () => {
    materialRepo.findForSession.mockResolvedValue(null);

    await expect(download(TUTOR, 'other')).rejects.toEqual(code('MATERIAL_NOT_FOUND'));

    expect(materialRepo.findForSession).toHaveBeenCalledWith(SESSION_ID, 'other');
  });
});

describe('generateUploadUrl', () => {
  const presign = (actor, overrides = {}) => service.generateUploadUrl({
    sessionId: SESSION_ID, actor, fileName: 'Guía de Ejercicios.pdf', fileSize: 2048, ...overrides,
  });

  it.each([['the tutor', TUTOR], ['an admin', ADMIN]])('test_should_sign_a_key_inside_the_session_folder_for_%s', async (_label, actor) => {
    const result = await presign(actor);

    expect(result.s3Key).toMatch(new RegExp(`^session-materials/${SESSION_ID}/guia-de-ejercicios-[a-f0-9]{6}\\.pdf$`));
    expect(result.contentType).toBe('application/pdf');
    expect(s3.generateUploadUrl).toHaveBeenCalledWith(result.s3Key, 'application/pdf', {
      expiresIn: 900,
      contentLength: 2048,
      tagging: 'status=unconfirmed',
    });
  });

  it.each([['the student', STUDENT], ['a stranger', STRANGER]])('test_should_refuse_%s', async (_label, actor) => {
    await expect(presign(actor)).rejects.toEqual(code('FORBIDDEN'));

    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
  });

  it.each([['Canceled'], ['Rejected']])('test_should_refuse_a_session_%s', async (status) => {
    sessionRepo.findById.mockResolvedValue(storedSession({ status }));

    await expect(presign(TUTOR)).rejects.toEqual(code('SESSION_NOT_ELIGIBLE'));
  });

  it.each([
    ['a type that is not allowed', { fileName: 'virus.exe' }, 'MATERIAL_TYPE_INVALID'],
    ['a file over the limit', { fileSize: 100 * 1024 * 1024 + 1 }, 'MATERIAL_TOO_LARGE'],
    ['an empty file', { fileSize: 0 }, 'MATERIAL_SIZE_INVALID'],
  ])('test_should_refuse_%s', async (_label, overrides, expected) => {
    await expect(presign(TUTOR, overrides)).rejects.toEqual(code(expected));
  });

  it('test_should_refuse_a_session_at_its_limit', async () => {
    materialRepo.countBySession.mockResolvedValue(20);

    await expect(presign(TUTOR)).rejects.toEqual(code('MATERIAL_LIMIT'));
  });
});

describe('registerMaterial', () => {
  const register = (actor, overrides = {}) => service.registerMaterial({
    sessionId: SESSION_ID, actor, s3Key: KEY, fileName: 'Guía.pdf', ...overrides,
  });

  it('test_should_store_what_is_in_s3_and_confirm_the_tag', async () => {
    const material = await register(TUTOR);

    expect(materialRepo.create).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      s3Key: KEY,
      fileName: 'Guía.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      createdById: TUTOR.id,
    });
    expect(s3.setObjectTags).toHaveBeenCalledWith(KEY, { status: 'confirmed' });
    expect(material).not.toHaveProperty('s3Key');
    expect(material.uploadedByTutor).toBe(true);
  });

  it.each([
    ['a key of another session', 'session-materials/22222222-2222-4222-8222-222222222222/a.pdf'],
    ['a key outside the folder', 'profile-pictures/a.pdf'],
    ['a traversal', `session-materials/${SESSION_ID}/../other/a.pdf`],
    ['a nested key', `session-materials/${SESSION_ID}/x/a.pdf`],
    ['the folder itself', `session-materials/${SESSION_ID}/`],
  ])('test_should_refuse_%s', async (_label, s3Key) => {
    await expect(register(TUTOR, { s3Key })).rejects.toEqual(code('MATERIAL_KEY_INVALID'));

    expect(s3.headObject).not.toHaveBeenCalled();
    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('test_should_refuse_the_student', async () => {
    await expect(register(STUDENT)).rejects.toEqual(code('FORBIDDEN'));

    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('test_should_refuse_a_name_that_does_not_match_the_file', async () => {
    await expect(register(TUTOR, { fileName: 'guia.exe' })).rejects.toEqual(code('MATERIAL_NAME_REQUIRED'));
  });

  it('test_should_refuse_a_key_with_a_type_that_is_not_allowed', async () => {
    await expect(register(TUTOR, { s3Key: `session-materials/${SESSION_ID}/a.exe`, fileName: 'a.exe' }))
      .rejects.toEqual(code('MATERIAL_TYPE_INVALID'));
  });

  it('test_should_refuse_a_file_that_never_reached_s3', async () => {
    s3.headObject.mockRejectedValue(Object.assign(new Error('missing'), { code: 'NOT_FOUND' }));

    await expect(register(TUTOR)).rejects.toEqual(code('MATERIAL_NOT_UPLOADED'));

    expect(materialRepo.create).not.toHaveBeenCalled();
  });

  it('test_should_refuse_a_stored_file_over_the_limit', async () => {
    s3.headObject.mockResolvedValue({ contentLength: 100 * 1024 * 1024 + 1 });

    await expect(register(TUTOR)).rejects.toEqual(code('MATERIAL_TOO_LARGE'));
  });

  it('test_should_answer_duplicate_when_the_key_is_already_registered', async () => {
    materialRepo.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(register(TUTOR)).rejects.toEqual(code('MATERIAL_DUPLICATE'));
  });

  it('test_should_keep_the_material_when_the_tag_update_fails', async () => {
    s3.setObjectTags.mockRejectedValue(new Error('s3 down'));

    await expect(register(TUTOR)).resolves.toEqual(expect.objectContaining({ fileName: 'Guía.pdf' }));
  });

  it('test_should_audit_an_admin_but_not_the_tutor', async () => {
    await register(TUTOR);
    expect(audit.logAction).not.toHaveBeenCalled();

    await register(ADMIN);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: ADMIN.id,
      action: 'SESSION_MATERIAL_UPLOAD',
      targetId: SESSION_ID,
    }));
  });
});

describe('deleteMaterial', () => {
  const remove = (actor) => service.deleteMaterial({ sessionId: SESSION_ID, materialId: 'm1', actor });

  it('test_should_let_the_tutor_remove_their_own_file', async () => {
    await expect(remove(TUTOR)).resolves.toEqual({ id: 'm1' });

    expect(materialRepo.deleteById).toHaveBeenCalledWith('m1');
    expect(s3.deleteObject).toHaveBeenCalledWith(KEY);
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('test_should_not_let_the_tutor_remove_what_an_admin_left', async () => {
    materialRepo.findForSession.mockResolvedValue(stored({ createdById: ADMIN.id }));

    await expect(remove(TUTOR)).rejects.toEqual(code('FORBIDDEN'));

    expect(materialRepo.deleteById).not.toHaveBeenCalled();
  });

  it('test_should_let_an_admin_remove_any_file_and_audit_it', async () => {
    await remove(ADMIN);

    expect(materialRepo.deleteById).toHaveBeenCalledWith('m1');
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'SESSION_MATERIAL_DELETE' }));
  });

  it.each([['the student', STUDENT], ['a stranger', STRANGER]])('test_should_refuse_%s', async (_label, actor) => {
    await expect(remove(actor)).rejects.toEqual(code('FORBIDDEN'));

    expect(materialRepo.deleteById).not.toHaveBeenCalled();
  });

  it('test_should_answer_not_found_for_a_material_of_another_session', async () => {
    materialRepo.findForSession.mockResolvedValue(null);

    await expect(remove(TUTOR)).rejects.toEqual(code('MATERIAL_NOT_FOUND'));
  });

  it('test_should_remove_the_row_even_if_s3_fails', async () => {
    s3.deleteObject.mockRejectedValue(new Error('s3 down'));

    await expect(remove(TUTOR)).resolves.toEqual({ id: 'm1' });
  });
});
