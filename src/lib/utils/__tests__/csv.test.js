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
