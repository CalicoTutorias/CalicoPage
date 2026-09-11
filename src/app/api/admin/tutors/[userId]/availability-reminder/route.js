/**
 * POST /api/admin/tutors/[userId]/availability-reminder
 * No body required.
 *
 * Envía a UN tutor el recordatorio "pon tu horario o no apareces en la lista
 * de tutores" (correo por Brevo + notificación in-app). Solo procede si el
 * tutor está aprobado, activo y hoy NO aparece para los estudiantes.
 *
 * A diferencia del envío masivo, aquí no hay margen entre envíos: el admin
 * lo pide a propósito desde el detalle del tutor.
 *
 * Auth: admin user (JWT + role lookup in DB).
 * Response 200: { success, sent: [...], failed: [...], skipped: [...] }
 * Response 400: el tutor sí aparece (INVALID_STATE) o no es tutor activo.
 * Response 503: la plantilla de Brevo no está configurada todavía.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'INVALID_USER_ID' }, { status: 400 });
  }

  try {
    const result = await adminService.sendAvailabilityReminders({
      userIds: [userId],
      adminId: auth.sub,
      request,
      skipRecentlyReminded: false,
    });

    // Con un solo destinatario, un "skipped" es un error de estado, no un
    // resultado parcial: el admin debe saber por qué no salió.
    if (result.sent.length === 0) {
      const reason = result.skipped[0]?.reason ?? result.failed[0]?.reason ?? 'UNKNOWN';
      const status = reason === 'NOT_FOUND' ? 404 : reason === 'SEND_FAILED' ? 502 : 400;
      return NextResponse.json({ success: false, error: reason, ...result }, { status });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'EMAIL_TEMPLATE_NOT_CONFIGURED') {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    console.error('[POST /api/admin/tutors/[userId]/availability-reminder]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
