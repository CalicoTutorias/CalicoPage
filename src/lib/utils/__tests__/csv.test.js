const { toCsv } = require('@/lib/utils/csv');

const cols = [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }];

it('starts with BOM and uses CRLF', () => {
  const out = toCsv([{ a: 1, b: 2 }], cols);
  expect(out.startsWith('﻿')).toBe(true);
  expect(out).toBe('﻿A,B\r\n1,2');
});
it('quotes commas, quotes and newlines; null is empty', () => {
  const out = toCsv([{ a: 'x,y', b: 'say "hi"\nok' }, { a: null, b: 'z' }], cols);
  expect(out).toContain('"x,y","say ""hi""\nok"');
  expect(out).toContain('\r\n,z');
});

it('neutralizes spreadsheet formulas in strings with a leading quote', () => {
  const out = toCsv(
    [
      { a: '=HYPERLINK("http://x","y")', b: '+1' },
      { a: '-2', b: '@SUM(A1)' },
      { a: '\tx', b: '\rx' },
    ],
    cols,
  );
  expect(out).toContain(`"'=HYPERLINK(""http://x"",""y"")",'+1`);
  expect(out).toContain(`'-2,'@SUM(A1)`);
  expect(out).toContain(`'\tx,"'\rx"`);
});
it('leaves numbers and safe strings untouched', () => {
  expect(toCsv([{ a: -5, b: 'a=b' }], cols)).toBe('\uFEFFA,B\r\n-5,a=b');
});
