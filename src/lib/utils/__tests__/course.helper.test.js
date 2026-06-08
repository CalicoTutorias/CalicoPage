/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/utils/course.helper.js` — course-code extraction
 * and normalization used when matching calendar events to courses.
 */

const {
  extractCourseFromTitle,
  formatCourseCode,
  parseCourse,
  containsCourseCode,
} = require('@/lib/utils/course.helper');

describe('extractCourseFromTitle', () => {
  it('pulls the course code out of a calendar title', () => {
    expect(extractCourseFromTitle('ISIS3710 - Desarrollo Web')).toBe('ISIS3710');
  });

  it('matches 3- and 4-letter prefixes', () => {
    expect(extractCourseFromTitle('MATE1214 Cálculo')).toBe('MATE1214');
    expect(extractCourseFromTitle('Tutoría de ECO1100')).toBe('ECO1100');
  });

  it('uppercases a lowercase code', () => {
    expect(extractCourseFromTitle('clase isis3710')).toBe('ISIS3710');
  });

  it('returns null when no course code is present or input is empty', () => {
    expect(extractCourseFromTitle('Tutoría general')).toBeNull();
    expect(extractCourseFromTitle('')).toBeNull();
    expect(extractCourseFromTitle(null)).toBeNull();
  });
});

describe('formatCourseCode', () => {
  it('uppercases and trims a code', () => {
    expect(formatCourseCode('  isis3710 ')).toBe('ISIS3710');
  });

  it('defaults to "Tutoría General" for empty input', () => {
    expect(formatCourseCode('')).toBe('Tutoría General');
    expect(formatCourseCode(null)).toBe('Tutoría General');
  });
});

describe('parseCourse', () => {
  it('normalizes "ISIS 3710" (with a space) to "ISIS3710"', () => {
    expect(parseCourse('ISIS 3710')).toBe('ISIS3710');
  });

  it('normalizes lowercase input', () => {
    expect(parseCourse('isis3710')).toBe('ISIS3710');
  });

  it('defaults to "Tutoría General" for empty input', () => {
    expect(parseCourse('')).toBe('Tutoría General');
    expect(parseCourse(null)).toBe('Tutoría General');
  });

  it('returns the uppercased/trimmed input when it is not a valid code', () => {
    expect(parseCourse('  física  ')).toBe('FÍSICA');
  });
});

describe('containsCourseCode', () => {
  it('detects an embedded course code', () => {
    expect(containsCourseCode('Necesito ayuda con ISIS3710 mañana')).toBe(true);
  });

  it('is false when there is no code or the input is empty', () => {
    expect(containsCourseCode('ayuda con matemáticas')).toBe(false);
    expect(containsCourseCode('')).toBe(false);
    expect(containsCourseCode(null)).toBe(false);
  });
});
