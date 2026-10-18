/**
 * Unit tests for src/lib/services/marketing-plan.service.js
 * The repository (Prisma) is mocked; dates, validation and optimistic locking run for real.
 */

jest.mock('@/lib/repositories/marketing-plan.repository', () => ({
  findPlan: jest.fn(),
  findPlanMeta: jest.fn(),
  findCurrentPlan: jest.fn(),
  listPlans: jest.fn(),
  createPlanWithEntries: jest.fn(),
  updatePlanIfVersion: jest.fn(),
  existingEntryKeys: jest.fn(),
  findEntry: jest.fn(),
  createEntry: jest.fn(),
  updateEntryIfVersion: jest.fn(),
  deleteEntry: jest.fn(),
}));

const repo = require('@/lib/repositories/marketing-plan.repository');
const service = require('@/lib/services/marketing-plan.service');

const ACTOR = { sub: 'u-1', name: 'Felipe' };
const day = (s) => new Date(`${s}T00:00:00.000Z`);

const entry = (overrides = {}) => ({
  key: '2026-10-20-tu-primera-tutoria',
  date: '2026-10-20',
  format: 'carrusel',
  title: 'Tu primera tutoría, pantallazo por pantallazo',
  brief: { tipo: 'publicacion', audiencia: 'estudiantes', objetivo: 'promocionar', cantidad: 7, tema: 'Cómo se agenda' },
  details: { idea: 'Una captura por slide', estilo: 'app-mockup' },
  ...overrides,
});

const planBody = (overrides = {}) => ({
  baseVersion: 0,
  title: 'Plan de contenido Calico · oct–dic 2026',
  startsOn: '2026-10-19',
  endsOn: '2026-12-31',
  settings: { semanas: { ancla: '2026-10-19', numero: 11, ultimaDeClases: 16 }, fases: [] },
  entries: [entry(), entry({ key: '2026-10-21-grabacion-1', date: '2026-10-21', format: 'grabacion', title: 'Grabación #1', brief: null })],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  repo.findPlanMeta.mockResolvedValue(null);
  repo.existingEntryKeys.mockResolvedValue([]);
  repo.createPlanWithEntries.mockResolvedValue({ key: '2026-2', version: 1 });
});

describe('savePlan', () => {
  it('test_should_import_a_season_with_all_its_entries', async () => {
    await expect(service.savePlan('2026-2', planBody(), ACTOR)).resolves.toEqual({ key: '2026-2', version: 1, created: true, entries: 2 });
    const [plan, entries] = repo.createPlanWithEntries.mock.calls[0];
    expect(plan).toMatchObject({ key: '2026-2', startsOn: day('2026-10-19'), endsOn: day('2026-12-31'), createdById: 'u-1', updatedById: 'u-1' });
    expect(entries[0]).toMatchObject({ key: '2026-10-20-tu-primera-tutoria', date: day('2026-10-20'), skipped: false, createdById: 'u-1' });
    expect(entries[1]).toMatchObject({ format: 'grabacion', brief: null, details: {} });
  });

  it('test_should_conflict_when_the_plan_already_exists', async () => {
    repo.findPlanMeta.mockResolvedValue({ id: 'p', key: '2026-2', version: 3 });
    await expect(service.savePlan('2026-2', planBody(), ACTOR)).rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 3 });
    expect(repo.createPlanWithEntries).not.toHaveBeenCalled();
  });

  it('test_should_refuse_entry_keys_that_already_exist', async () => {
    repo.existingEntryKeys.mockResolvedValue(['2026-10-21-grabacion-1']);
    await expect(service.savePlan('2026-2', planBody(), ACTOR)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR', message: expect.stringContaining('2026-10-21-grabacion-1'),
    });
  });

  it('test_should_update_only_the_header_with_optimistic_lock', async () => {
    repo.updatePlanIfVersion.mockResolvedValue(1);
    const { entries, ...header } = planBody({ baseVersion: 2, title: 'Nuevo título' });
    await expect(service.savePlan('2026-2', header, ACTOR)).resolves.toEqual({ key: '2026-2', version: 3, created: false });
    expect(repo.updatePlanIfVersion).toHaveBeenCalledWith('2026-2', 2, expect.objectContaining({ title: 'Nuevo título', updatedById: 'u-1' }));
    expect(entries).toHaveLength(2);
  });

  it('test_should_refuse_entries_when_updating_the_header', async () => {
    await expect(service.savePlan('2026-2', planBody({ baseVersion: 2 }), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.updatePlanIfVersion).not.toHaveBeenCalled();
  });

  it('test_should_conflict_when_someone_saved_the_header_first', async () => {
    repo.updatePlanIfVersion.mockResolvedValue(0);
    repo.findPlanMeta.mockResolvedValue({ id: 'p', key: '2026-2', version: 5 });
    await expect(service.savePlan('2026-2', planBody({ baseVersion: 2, entries: undefined }), ACTOR))
      .rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 5 });
  });

  it.each([
    ['dates out of order', { startsOn: '2026-12-31', endsOn: '2026-10-19' }],
    ['an impossible date', { endsOn: '2026-02-30' }],
    ['repeated entry keys', { entries: [entry(), entry()] }],
    ['an unknown format', { entries: [entry({ format: 'tiktok' })] }],
    ['an unknown brief type', { entries: [entry({ brief: { tipo: 'podcast', audiencia: 'estudiantes' } })] }],
    ['an entry key that is not a slug', { entries: [entry({ key: '../x' })] }],
  ])('test_should_reject_%s', async (_label, overrides) => {
    await expect(service.savePlan('2026-2', planBody(overrides), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.createPlanWithEntries).not.toHaveBeenCalled();
  });

  it('test_should_reject_the_reserved_plan_key_current', async () => {
    await expect(service.savePlan('current', planBody(), ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('reading', () => {
  it('test_should_return_the_current_plan_with_calendar_days', async () => {
    repo.findCurrentPlan.mockResolvedValue({
      key: '2026-2', title: 'Plan', startsOn: day('2026-10-19'), endsOn: day('2026-12-31'), settings: { nota: 'guía' }, version: 2,
      updatedBy: { name: 'Felipe' },
      entries: [{ key: 'e', date: day('2026-10-20'), format: 'carrusel', title: 'T', brief: null, details: {}, skipped: false, version: 1, updatedBy: null }],
    });
    const plan = await service.getCurrentPlan();
    expect(plan).toMatchObject({ key: '2026-2', startsOn: '2026-10-19', endsOn: '2026-12-31', updatedBy: 'Felipe' });
    expect(plan.entries[0]).toEqual(expect.objectContaining({ key: 'e', date: '2026-10-20', brief: null, skipped: false }));
    expect(repo.findCurrentPlan.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('test_should_404_when_there_is_no_plan', async () => {
    repo.findCurrentPlan.mockResolvedValue(null);
    await expect(service.getCurrentPlan()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    repo.findPlan.mockResolvedValue(null);
    await expect(service.getPlan('2026-2')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('entries', () => {
  const save = (overrides = {}) => {
    const { key, ...fields } = entry();
    return { baseVersion: 0, ...fields, ...overrides };
  };

  it('test_should_create_an_entry_in_an_existing_plan', async () => {
    repo.findPlanMeta.mockResolvedValue({ id: 'plan-id', key: '2026-2', version: 1 });
    repo.findEntry.mockResolvedValue(null);
    repo.createEntry.mockResolvedValue({ key: 'nueva', version: 1 });
    await expect(service.saveEntry('2026-2', 'nueva', save(), ACTOR)).resolves.toEqual({ key: 'nueva', version: 1, created: true });
    expect(repo.createEntry).toHaveBeenCalledWith(expect.objectContaining({ key: 'nueva', planId: 'plan-id', date: day('2026-10-20'), createdById: 'u-1' }));
  });

  it('test_should_404_creating_in_a_missing_plan_and_conflict_on_a_taken_key', async () => {
    await expect(service.saveEntry('2026-2', 'nueva', save(), ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    repo.findPlanMeta.mockResolvedValue({ id: 'plan-id', key: '2026-2', version: 1 });
    repo.findEntry.mockResolvedValue({ version: 4, plan: { key: '2026-2' } });
    await expect(service.saveEntry('2026-2', 'nueva', save(), ACTOR)).rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 4 });
  });

  it('test_should_move_or_skip_an_entry_with_optimistic_lock', async () => {
    repo.updateEntryIfVersion.mockResolvedValue(1);
    await expect(service.saveEntry('2026-2', 'e', save({ baseVersion: 2, date: '2026-10-25', skipped: true }), ACTOR))
      .resolves.toEqual({ key: 'e', version: 3, created: false });
    expect(repo.updateEntryIfVersion).toHaveBeenCalledWith('2026-2', 'e', 2, expect.objectContaining({
      date: day('2026-10-25'), skipped: true, updatedById: 'u-1',
    }));
  });

  it('test_should_conflict_or_404_when_the_update_matches_nothing', async () => {
    repo.updateEntryIfVersion.mockResolvedValue(0);
    repo.findEntry.mockResolvedValue({ version: 7, plan: { key: '2026-2' } });
    await expect(service.saveEntry('2026-2', 'e', save({ baseVersion: 2 }), ACTOR)).rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 7 });
    repo.findEntry.mockResolvedValue({ version: 7, plan: { key: 'otro-plan' } });
    await expect(service.saveEntry('2026-2', 'e', save({ baseVersion: 2 }), ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('test_should_keep_unknown_brief_fields', async () => {
    repo.updateEntryIfVersion.mockResolvedValue(1);
    await service.saveEntry('2026-2', 'e', save({ baseVersion: 1, brief: { tipo: 'reel-animado', audiencia: 'tutores', duracion: 20 } }), ACTOR);
    expect(repo.updateEntryIfVersion.mock.calls[0][3].brief).toEqual({ tipo: 'reel-animado', audiencia: 'tutores', duracion: 20 });
  });

  it('test_should_delete_an_entry_of_that_plan_only', async () => {
    repo.findEntry.mockResolvedValue({ title: 'T', plan: { key: '2026-2' } });
    await expect(service.deleteEntry('2026-2', 'e')).resolves.toEqual({ key: 'e', title: 'T' });
    expect(repo.deleteEntry).toHaveBeenCalledWith('e');
    repo.findEntry.mockResolvedValue({ title: 'T', plan: { key: 'otro' } });
    await expect(service.deleteEntry('2026-2', 'e')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('calendarDate', () => {
  it('test_should_only_accept_real_calendar_days', () => {
    const { isCalendarDate } = service.__testing;
    expect(isCalendarDate('2026-12-31')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('20-10-2026')).toBe(false);
    expect(require('@/lib/utils/calendar-date').calendarDate.fromDb(day('2026-10-20'))).toBe('2026-10-20');
  });
});
