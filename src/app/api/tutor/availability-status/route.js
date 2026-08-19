/**
 * GET /api/tutor/availability-status
 *
 * Estado de disponibilidad del tutor autenticado en la ventana móvil de los
 * próximos días: el mismo semáforo que ve el admin, pero para uno mismo.
 * Alimenta el aviso de "pon tu disponibilidad" y el indicador del perfil.
 *
 * Identidad tomada del JWT (`auth.sub`), nunca del body ni de la URL.
 *
 * Auth: Bearer JWT (tutor aprobado)
 * Response 200: { success, availability: { status, hours, thresholdHours, … } }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import { getAvailabilityStatusForTutor } from '@/lib/services/tutor-availability-status.service';

export async function GET(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const availability = await getAvailabilityStatusForTutor(auth.sub);
    return NextResponse.json({ success: true, availability });
  } catch (err) {
    console.error('[GET /api/tutor/availability-status]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
