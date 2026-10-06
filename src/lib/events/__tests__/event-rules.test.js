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
])('%j → %s', (patch, code) => {
  expect(validateEventDraft({ ...valid, ...patch })?.code).toBe(code);
});

it('assertPublishable rejects past starts', () => {
  expect(assertPublishable(valid, new Date('2026-12-01T00:00:00Z'))?.code).toBe('STARTS_IN_PAST');
  expect(assertPublishable(valid, new Date('2026-10-01T00:00:00Z'))).toBeNull();
});
