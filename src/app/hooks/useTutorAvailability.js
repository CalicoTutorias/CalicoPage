"use client";

import { useState, useEffect, useCallback } from "react";
import { AvailabilityService } from "../services/core/AvailabilityService";
import { TutoringSessionService } from "../services/core/TutoringSessionService";

/**
 * useTutorAvailability
 *
 * Centralizes all data fetching for the tutor availability page.
 * Single source of truth: PostgreSQL via internal API routes.
 *
 * Data model:
 *   - availabilities: recurring weekly blocks { id, tutorId, dayOfWeek (0-6), startTime, endTime }
 *   - schedule:       preferences { bufferTime, maxSessionsPerDay, minBookingNotice, autoAcceptSession }
 *   - sessions:       all sessions for this tutor (Accepted, Completed, Rejected, Canceled…)
 *   - pendingSessions: sessions with status = 'Pending'
 *
 * Future — student-facing calendar view:
 *   To compute truly free slots for a student, you must subtract booked sessions from
 *   availabilities BEFORE rendering. Algorithm:
 *     1. For a given dayOfWeek block [startTime, endTime], collect all sessions WHERE
 *        tutorId = X AND status IN ('Pending', 'Accepted') AND the session's scheduledStart
 *        falls on the same dayOfWeek and overlaps with the block window.
 *     2. Add schedule.bufferTime (minutes) to each session's scheduledEnd before checking
 *        overlap, so back-to-back bookings respect the buffer.
 *     3. The remaining gaps are the truly available slots to show the student.
 *   This logic belongs in a server-side service (src/lib/services/availability.service.js)
 *   and should be exposed via GET /api/availabilities/free?tutorId=X&date=YYYY-MM-DD.
 */
export function useTutorAvailability() {
  const [availabilities, setAvailabilities] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [pendingSessions, setPendingSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // All calls are auth-based (JWT in header) — no userId arg needed.
      const [avails, schedResult, allSessions, pending] = await Promise.all([
        AvailabilityService.getMyAvailabilities(),
        AvailabilityService.getMySchedule(),
        TutoringSessionService.getTutorSessions(),
        TutoringSessionService.getPendingSessionsForTutor(),
      ]);

      setAvailabilities(avails);
      setSchedule(schedResult.schedule);
      setSessions(allSessions);
      setPendingSessions(pending);
    } catch (err) {
      setError(err.message ?? "Error al cargar disponibilidad");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { availabilities, schedule, sessions, pendingSessions, loading, error, reload: load };
}
