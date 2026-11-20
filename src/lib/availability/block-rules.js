/**
 * Pure helpers for booking blocks of consecutive hours ("tutorías en bloque").
 * No DB, no time zone logic: callers pass comparable Dates.
 */

const MS_PER_HOUR = 3_600_000;

/**
 * Merge ranges that touch or overlap, so two availability blocks published
 * back to back (14–15 and 15–16) count as one continuous 14–16 window.
 * @param {{ start: Date, end: Date }[]} ranges
 * @returns {{ start: Date, end: Date }[]} sorted, merged
 */
export function mergeContiguousRanges(ranges) {
  const sorted = (ranges || [])
    .filter((r) => r && r.start instanceof Date && r.end instanceof Date && r.end > r.start)
    .map((r) => ({ start: new Date(r.start), end: new Date(r.end) }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push(r);
    }
  }
  return merged;
}

/** True when [start, end] fits entirely inside one of the (merged) ranges. */
export function fitsInRanges(start, end, ranges) {
  return mergeContiguousRanges(ranges).some((r) => r.start <= start && r.end >= end);
}

/** Minimum-notice rule: the session must start at least `noticeHours` from now. */
export function meetsBookingNotice(start, noticeHours, now = new Date()) {
  const hours = Number(noticeHours);
  if (!Number.isFinite(hours) || hours <= 0) return true;
  return start.getTime() - now.getTime() >= hours * MS_PER_HOUR;
}

/** Whole hours of [start, end), or null when not whole hours. */
export function blockHours(start, end) {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0 || ms % MS_PER_HOUR !== 0) return null;
  return ms / MS_PER_HOUR;
}
