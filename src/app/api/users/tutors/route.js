/**
 * GET /api/users/tutors — Tutores visibles para estudiantes, opcionalmente por courseId
 * Query params: courseId (optional), limit (optional, default 100)
 *
 * Solo devuelve tutores aprobados, activos y con al menos MIN_LISTING_HOURS
 * horas libres publicadas en la ventana (ver lib/availability/listing-visibility.js
 * y services/tutor-listing.service.js): un tutor sin horario, o con muy poco,
 * no aparece porque no habría nada que reservarle. El panel admin usa otras
 * rutas y sí ve a todos.
 *
 * Si la petición lleva Authorization válido, se excluye el usuario autenticado del listado
 * (ej. tutor aprobado navegando en modo estudiante no ve su propio perfil/disponibilidad aquí).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tryAuthenticateRequest } from '@/lib/auth/middleware';
import * as userService from '@/lib/services/user.service';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId');
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 100;

  let result;
  if (courseId) {
    result = await userService.getTutorsByCourse(courseId, limit);
  } else {
    result = await userService.getAllTutors(limit);
  }

  const auth = await tryAuthenticateRequest(request);
  const selfId = auth?.sub;
  let tutors = result.tutors || [];
  if (selfId) {
    tutors = tutors.filter((t) => t.id !== selfId);
  }

  return NextResponse.json({
    ...result,
    tutors,
    count: tutors.length,
  });
}
