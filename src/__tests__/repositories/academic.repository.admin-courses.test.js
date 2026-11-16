/**
 * @jest-environment node
 *
 * findCoursesPageForAdmin: server-side search + pagination for the admin
 * course table. The SQL itself runs against Postgres; here we pin the inputs
 * it receives (folded search pattern, LIMIT/OFFSET) and the result shape.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    course: { findMany: jest.fn() },
  },
}));

const prisma = require('@/lib/prisma').default;
const { findCoursesPageForAdmin, foldSearchText } = require('@/lib/repositories/academic.repository');

/** Flattens the values of a tagged-template $queryRaw call, nested Prisma.sql fragments included. */
function sqlValues(call) {
  const [, ...values] = call;
  return values.flatMap((value) => (value && Array.isArray(value.values) ? value.values : [value]));
}

function sqlText(call) {
  const [strings, ...values] = call;
  return strings.join('?') + values.map((v) => (v && v.strings ? v.strings.join('?') : '')).join(' ');
}

beforeEach(() => jest.clearAllMocks());

describe('foldSearchText', () => {
  it('lowercases, strips accents and collapses whitespace', () => {
    expect(foldSearchText('  Cálculo   DIFERENCIAL  ñ ')).toBe('calculo diferencial n');
    expect(foldSearchText(undefined)).toBe('');
  });
});

describe('findCoursesPageForAdmin', () => {
  it('folds and escapes the search term and paginates in SQL', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }]);
    prisma.course.findMany.mockResolvedValue([
      { id: 'a', code: 'MATE1203', _count: { tutorCourses: 1 } },
      { id: 'b', code: 'MATE1214', _count: { tutorCourses: 0 } },
    ]);

    const result = await findCoursesPageForAdmin({ search: 'Cálculo_100%', limit: 20, offset: 40 });

    const [countCall, pageCall] = prisma.$queryRaw.mock.calls;
    expect(sqlValues(countCall)).toContain('%calculo\\_100\\%%');
    expect(sqlValues(pageCall)).toEqual(expect.arrayContaining(['%calculo\\_100\\%%', 20, 40]));
    expect(sqlText(pageCall)).toContain('array_to_string(c.aliases');

    expect(prisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['b', 'a'] } },
    }));
    // Keeps the SQL order and adds the tutor count.
    expect(result.total).toBe(2);
    expect(result.courses.map((c) => c.id)).toEqual(['b', 'a']);
    expect(result.courses[0].approvedTutorCount).toBe(0);
  });

  it('skips the filter without a search and the second query on an empty page', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ total: 5 }])
      .mockResolvedValueOnce([]);

    const result = await findCoursesPageForAdmin({ search: '   ', limit: 20, offset: 100 });

    expect(sqlText(prisma.$queryRaw.mock.calls[0])).not.toContain('LIKE');
    expect(prisma.course.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ courses: [], total: 5 });
  });
});
