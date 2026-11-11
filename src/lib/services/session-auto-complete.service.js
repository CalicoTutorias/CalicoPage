/**
 * Session Auto-Complete Service
 *
 * No screen asks the tutor to mark a session as done, so sessions stayed
 * `Accepted` forever. A student's review completes its session at once
 * (review.service); this daily job completes the rest once they are over, so
 * the students get the "rate your session" prompt and the tutor the reminder to
 * rate them (completeSession).
 *
 * Left out (session.repository.findSessionsToAutoComplete): manual sessions
 * whose student has not paid yet, which the proof upload completes.
 */

import * as sessionRepo from '../repositories/session.repository';
import { completeSession } from './session.service';

/** Wait this long after the end, so a session that runs over is not cut short. */
export const AUTO_COMPLETE_GRACE_MINUTES = 60;
/**
 * Older than this, a session is completed without notifications: the pending
 * reviews are still created, but nobody is pinged about something weeks old
 * (the first run finds the whole backlog).
 */
export const AUTO_COMPLETE_NOTIFY_DAYS = 7;
const BATCH_LIMIT = 200;

/**
 * @returns {Promise<{ found: number, completed: number, skipped: number, failed: number }>}
 *   skipped: another trigger completed it in between (INVALID_STATUS).
 */
export async function autoCompleteEndedSessions({ now = new Date() } = {}) {
  const endedBefore = new Date(now.getTime() - AUTO_COMPLETE_GRACE_MINUTES * 60_000);
  const notifyAfter = now.getTime() - AUTO_COMPLETE_NOTIFY_DAYS * 24 * 60 * 60_000;
  const sessions = await sessionRepo.findSessionsToAutoComplete({ endedBefore, limit: BATCH_LIMIT });

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  // One at a time: each completion writes notifications and reviews, and a
  // failure must only cost that session.
  for (const session of sessions) {
    const anonymousOnly = session.participants.length > 0
      && session.participants.every((p) => p.student?.kind === 'ExternalTemporary');
    const recent = new Date(session.endTimestamp).getTime() >= notifyAfter;
    try {
      await completeSession(session.id, session.tutorId, {
        withReviews: !anonymousOnly,
        promptStudents: recent,
        remindTutor: recent,
      });
      completed += 1;
    } catch (err) {
      if (err.code === 'INVALID_STATUS') {
        skipped += 1;
      } else {
        failed += 1;
        console.error(`[auto-complete] Failed to complete session ${session.id}: ${err.message}`);
      }
    }
  }

  return { found: sessions.length, completed, skipped, failed };
}
