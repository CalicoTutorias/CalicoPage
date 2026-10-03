const BOM = '﻿';

function cell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  // CSV formula injection: strings that a spreadsheet would run as a formula
  // are prefixed with a quote. Numbers stay as they are.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {object[]} rows
 * @param {{ key: string, header: string }[]} columns
 */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return BOM + lines.join('\r\n');
}
