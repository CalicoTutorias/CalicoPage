/**
 * Shared answer for the reschedule-by-agreement routes: a coded business
 * refusal from session-reschedule.service becomes its 4xx with
 * `{ error: <code> }` (the UI maps the code to an i18n message); anything
 * else is logged and answered as an opaque 500.
 */

import { NextResponse } from 'next/server';
import { RESCHEDULE_ERROR_STATUS, isRescheduleError } from '../services/session-reschedule.service';

export function rescheduleErrorResponse(err, tag) {
  if (isRescheduleError(err)) {
    return NextResponse.json(
      { success: false, error: err.code },
      { status: RESCHEDULE_ERROR_STATUS[err.code] },
    );
  }
  console.error(`[${tag}]`, err?.message);
  return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
}
