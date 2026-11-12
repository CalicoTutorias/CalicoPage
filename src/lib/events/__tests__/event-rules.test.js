const { validateEventDraft, assertPublishable } = require('@/lib/events/event-rules');

const valid = {
  startsAt: '2026-10-18T23:00:00.000Z',
  endsAt: '2026-10-19T01:00:00.000Z',
  modality: 'Virtual',
  autoMeet: true,
  meetingUrl: null,
  location: null,
  price: 0,
  tutorIds: ['t1'],
};

it('accepts a valid draft', () => expect(validateEventDraft(valid)).toBeNull());

it.each([
  [{ endsAt: '2026-10-18T22:00:00.000Z' }, 'ENDS_BEFORE_START'],
  [{ endsAt: '2026-10-19T11:00:01.000Z' }, 'TOO_LONG'],
  [{ autoMeet: false }, 'MEETING_URL_REQUIRED'],
  [{ modality: 'InPerson', autoMeet: false }, 'LOCATION_REQUIRED'],
  [{ modality: 'InPerson', autoMeet: true, location: 'Aula 1' }, 'AUTO_MEET_NOT_VIRTUAL'],
  [{ price: 1000 }, 'PRICE_BELOW_MINIMUM'],
  [{ tutorIds: [] }, 'TUTORS_REQUIRED'],
  [{ requiresApproval: true, price: 20000, earlyBirdSlots: 5, earlyBirdPercent: 10 }, 'EARLY_BIRD_WITH_APPROVAL'],
])('%j → %s', (patch, code) => {
  expect(validateEventDraft({ ...valid, ...patch })?.code).toBe(code);
});

it('accepts an approval event with an informative price and no early-bird', () => {
  expect(validateEventDraft({ ...valid, requiresApproval: true, price: 25000 })).toBeNull();
});

it('assertPublishable rejects past starts', () => {
  expect(assertPublishable(valid, new Date('2026-12-01T00:00:00Z'))?.code).toBe('STARTS_IN_PAST');
  expect(assertPublishable(valid, new Date('2026-10-01T00:00:00Z'))).toBeNull();
});

describe('time to be confirmed and WhatsApp group', () => {
  const tbc = {
    ...valid,
    timeTbc: true,
    durationHours: 2,
    startsAt: '2026-10-19T05:00:00.000Z',
    endsAt: '2026-10-20T04:59:00.000Z',
  };

  it('accepts a whole-day window when a duration is given', () => expect(validateEventDraft(tbc)).toBeNull());

  it.each([null, 0, -1, 13])('rejects duration %s', (durationHours) => {
    expect(validateEventDraft({ ...tbc, durationHours })).toEqual({ code: 'DURATION_INVALID', field: 'durationHours' });
  });

  it('accepts a WhatsApp group as the only link of a virtual event', () => {
    expect(validateEventDraft({ ...valid, autoMeet: false, whatsappUrl: 'https://chat.whatsapp.com/abc' })).toBeNull();
  });

  it('is publishable until the day ends, not just until it starts', () => {
    const during = new Date('2026-10-19T15:00:00.000Z');
    expect(assertPublishable(tbc, during)).toBeNull();
    expect(assertPublishable({ ...tbc, timeTbc: false, durationHours: null }, during)?.code).toBe('STARTS_IN_PAST');
  });
});
