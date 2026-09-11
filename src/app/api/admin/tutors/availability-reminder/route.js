/**
 * POST /api/admin/tutors/availability-reminder
 * Body (opcional): { userIds?: string[] }
 *
 * Envío MASIVO del recordatorio "pon tu horario o no apareces en la lista de
 * tutores". Sin `userIds` va a todos los tutores activos que hoy NO aparecen
 * para los estudiantes (`isListed === false`). Con `userIds`, solo a esos,
 * y aun así se salta a los que sí aparecen.
 *
 * Respeta un margen (`AVAILABILITY_REMINDER_COOLDOWN_DAYS`) para no escribir
 * dos veces al mismo tutor en pocos días; los saltados se devuelven en
 * `skipped` con su motivo.
 *
 * Auth: admin user (JWT + role lookup in DB).
 * Response 200: { success, sent: [...], failed: [...], skipped: [...] }
 * Response 503: la plantilla de Brevo no está configurada todavía.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

const bodySchema = z.object({
  userIds: z.array(z.string().min(1)).max(500).optional(),
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    const result = await adminService.sendAvailabilityReminders({
      userIds: parsed.data.userIds,
      adminId: auth.sub,
      request,
      skipRecentlyReminded: true,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'EMAIL_TEMPLATE_NOT_CONFIGURED') {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    console.error('[POST /api/admin/tutors/availability-reminder]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
