/**
 * Tests for the pending-booking handoff (localStorage bridge that survives
 * the login / email-verification detour). Runs under jsdom, so
 * window.localStorage is the real Storage implementation.
 */

import {
  savePendingBooking,
  readPendingBooking,
  peekPendingBooking,
  consumePendingBooking,
  clearPendingBooking,
  PENDING_BOOKING_TTL_MS,
} from '@/app/services/utils/pendingBooking';

const STORAGE_KEY = 'calico_pending_booking';
const BOOKING_URL = '/home/agendar?tutorId=t1&start=2026-09-01T14%3A00%3A00.000Z';

describe('pendingBooking', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('round-trips a valid booking URL', () => {
    savePendingBooking(BOOKING_URL);
    expect(peekPendingBooking()).toBe(BOOKING_URL);
    // peek must not consume
    expect(peekPendingBooking()).toBe(BOOKING_URL);
  });

  it('consume returns the URL once and clears it', () => {
    savePendingBooking(BOOKING_URL);
    expect(consumePendingBooking()).toBe(BOOKING_URL);
    expect(consumePendingBooking()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('refuses to store an external URL', () => {
    savePendingBooking('https://evil.com/phish');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(peekPendingBooking()).toBeNull();
  });

  it('rejects a tampered entry pointing off-origin', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: '//evil.com', savedAt: Date.now() }),
    );
    expect(peekPendingBooking()).toBeNull();
    // The bad entry is also purged.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('expires entries older than the TTL', () => {
    savePendingBooking(BOOKING_URL);
    const realNow = Date.now();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(realNow + PENDING_BOOKING_TTL_MS + 1000);
    expect(peekPendingBooking()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('survives corrupted JSON without throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(() => peekPendingBooking()).not.toThrow();
    expect(peekPendingBooking()).toBeNull();
  });

  it('treats a missing savedAt as expired', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: BOOKING_URL }));
    expect(peekPendingBooking()).toBeNull();
  });

  it('clearPendingBooking is a no-op when nothing is stored', () => {
    expect(() => clearPendingBooking()).not.toThrow();
  });

  it('readPendingBooking is pure: reports an invalid entry as absent WITHOUT purging it', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: '//evil.com', savedAt: Date.now() }),
    );
    expect(readPendingBooking()).toBeNull();
    // Still there — cleanup is peek/consume's job, not the render-safe read's.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
