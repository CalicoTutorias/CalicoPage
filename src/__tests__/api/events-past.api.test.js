/**
 * @jest-environment node
 *
 * GET /api/events/past and GET /api/events/[slug]/results: public, cacheable,
 * and the page number is sanitised.
 */

jest.mock('@/lib/services/event.service', () => ({
  listPastEvents: jest.fn(),
  getEventResults: jest.fn(),
}));

const service = require('@/lib/services/event.service');
const { GET: getPast } = require('@/app/api/events/past/route');
const { GET: getResults } = require('@/app/api/events/[slug]/results/route');

beforeEach(() => {
  jest.clearAllMocks();
  service.listPastEvents.mockResolvedValue({ events: [], total: 0, hasMore: false });
  service.getEventResults.mockResolvedValue({ ended: true, results: null, comments: [], totalComments: 0, hasMore: false });
});

it('lists past events publicly, with a CDN cache', async () => {
  const res = await getPast(new Request('http://localhost/api/events/past?page=2'));

  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toContain('public');
  expect(service.listPastEvents).toHaveBeenCalledWith({ page: 2 });
});

it('falls back to the first page on a bad page number', async () => {
  await getPast(new Request('http://localhost/api/events/past?page=-4'));

  expect(service.listPastEvents).toHaveBeenCalledWith({ page: 1 });
});

it('gives the results of an event by slug', async () => {
  const res = await getResults(new Request('http://localhost/api/events/repaso/results'), {
    params: Promise.resolve({ slug: 'repaso' }),
  });

  expect(res.status).toBe(200);
  expect(service.getEventResults).toHaveBeenCalledWith({ slug: 'repaso', page: 1 });
});

it('answers 404 for an event that is not public', async () => {
  service.getEventResults.mockRejectedValue(Object.assign(new Error('EVENT_NOT_FOUND'), { code: 'EVENT_NOT_FOUND' }));

  const res = await getResults(new Request('http://localhost/api/events/x/results'), {
    params: Promise.resolve({ slug: 'x' }),
  });

  expect(res.status).toBe(404);
});
