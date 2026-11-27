/**
 * Shared answer for the group-invitation routes: a coded business refusal
 * from session-invitation.service becomes its 4xx with `{ error: <code> }`
 * (the UI maps the code to an i18n message); anything else is logged and
 * answered as an opaque 500.
 */

import { NextResponse } from 'next/server';
import { INVITATION_ERROR_STATUS, isInvitationError } from '../services/session-invitation.service';

export function invitationErrorResponse(err, tag) {
  if (isInvitationError(err)) {
    return NextResponse.json(
      { success: false, error: err.code, message: err.message },
      { status: INVITATION_ERROR_STATUS[err.code] },
    );
  }
  console.error(`[${tag}]`, err?.message);
  return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
}
