/**
 * POST /api/calico-calendar/tutoring-session — Create tutoring session event in Calico calendar
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Esta operación no está disponible públicamente.' },
    { status: 404 },
  );
}
