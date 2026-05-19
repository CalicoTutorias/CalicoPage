/**
 * POST /api/availability/joint/multiple
 *
 * Returns expanded availability windows for multiple tutors in a single request.
 * Used by the joint availability calendar (course-level view) so students can see
 * all slots across every tutor teaching a given course.
 *
 * Body: { tutorIds: string[] }
 *
 * Response:
 * {
 *   success: true,
 *   tutorsAvailability: [
 *     { tutorId, connected, slots: [...windows], totalSlots, bufferMinutes }
 *   ],
 *   totalTutors, connectedTutors, totalSlots
 * }
 *
 * Each "slot" (window) is a multi-hour availability block expanded to a specific date.
 * The frontend (AvailabilityCalendar) further splits these windows into 1h hourly slots
 * via SlotService.generateHourlySlotsFromAvailabilities.
 *
 * Uses 3 bulk DB queries regardless of tutor count (not 3×N).
 * Filters windows that are fully covered by a booked session + buffer.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const WEEKS_AHEAD = 12;

function formatTimeToHHMM(value) {
  if (!value) return '00:00';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '00:00';
  const h = d.getUTCHours().toString().padStart(2, '0');
  const min = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * Expand weekly recurring blocks into dated availability windows for the next
 * WEEKS_AHEAD weeks. Each block (dayOfWeek + startTime/endTime) produces one
 * window entry per matching date with full ISO startDateTime/endDateTime.
 */
function expandBlocksToDatedWindows(blocks, tutorId) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];

  const windows = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const until = new Date(today);
  until.setDate(until.getDate() + WEEKS_AHEAD * 7);

  for (let d = new Date(today); d <= until; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${mo}-${da}`;

    for (const block of blocks) {
      if (block.dayOfWeek !== dow) continue;
      const startHHMM = formatTimeToHHMM(block.startTime);
      const endHHMM = formatTimeToHHMM(block.endTime);
      windows.push({
        id: `${block.id}-${dateStr}`,
        tutorId,
        tutorEmail: tutorId,
        title: 'Disponible',
        description: '',
        location: 'Virtual',
        startDateTime: `${dateStr}T${startHHMM}:00`,
        endDateTime: `${dateStr}T${endHHMM}:00`,
        isBooked: false,
        course: null,
      });
    }
  }

  return windows;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tutorIds = body?.tutorIds;

    if (!Array.isArray(tutorIds) || tutorIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'tutorIds must be a non-empty array' },
        { status: 400 },
      );
    }

    const limited = tutorIds.slice(0, 50);
    const now = new Date();
    const futureWindow = new Date(now.getTime() + WEEKS_AHEAD * 7 * 24 * 60 * 60 * 1000);

    // 3 bulk queries regardless of tutor count
    const [allBlocks, allSessions, allSchedules] = await Promise.all([
      prisma.availability.findMany({
        where: { userId: { in: limited } },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.session.findMany({
        where: {
          tutorId: { in: limited },
          status: { in: ['Pending', 'Accepted'] },
          startTimestamp: { gte: now, lte: futureWindow },
        },
        select: { tutorId: true, startTimestamp: true, endTimestamp: true },
      }),
      prisma.schedule.findMany({
        where: { userId: { in: limited } },
        select: { userId: true, bufferTime: true },
      }),
    ]);

    // Group fetched data by tutorId
    const blocksByTutor = {};
    const sessionsByTutor = {};
    const scheduleByTutor = {};

    for (const block of allBlocks) {
      if (!blocksByTutor[block.userId]) blocksByTutor[block.userId] = [];
      blocksByTutor[block.userId].push(block);
    }
    for (const session of allSessions) {
      if (!sessionsByTutor[session.tutorId]) sessionsByTutor[session.tutorId] = [];
      sessionsByTutor[session.tutorId].push(session);
    }
    for (const schedule of allSchedules) {
      scheduleByTutor[schedule.userId] = schedule;
    }

    const tutorsAvailability = limited.map((tutorId) => {
      const blocks = blocksByTutor[tutorId] || [];
      const sessions = sessionsByTutor[tutorId] || [];
      const bufferMinutes = scheduleByTutor[tutorId]?.bufferTime ?? 15;
      const bufferMs = bufferMinutes * 60_000;

      const windows = expandBlocksToDatedWindows(blocks, tutorId);

      // Exclude windows fully covered by a booked session (including its buffer).
      // Partially overlapping windows are kept — the hourly slot split on the
      // frontend will naturally skip booked sub-slots via getAvailableSlots.
      const freeWindows = windows.filter((win) => {
        const winStart = new Date(win.startDateTime).getTime();
        const winEnd = new Date(win.endDateTime).getTime();
        return !sessions.some((s) => {
          const sStart = new Date(s.startTimestamp).getTime() - bufferMs;
          const sEnd = new Date(s.endTimestamp).getTime() + bufferMs;
          return sStart <= winStart && sEnd >= winEnd;
        });
      });

      return {
        tutorId,
        connected: freeWindows.length > 0,
        slots: freeWindows,
        totalSlots: freeWindows.length,
        bufferMinutes,
      };
    });

    const connectedTutors = tutorsAvailability.filter((t) => t.connected).length;
    const totalSlots = tutorsAvailability.reduce((sum, t) => sum + t.totalSlots, 0);

    return NextResponse.json({
      success: true,
      tutorsAvailability,
      totalTutors: tutorsAvailability.length,
      connectedTutors,
      totalSlots,
    });
  } catch (err) {
    console.error('[joint/multiple] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
