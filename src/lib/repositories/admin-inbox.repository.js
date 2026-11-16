/**
 * Conteos de las colas del Inicio de admin. Todo se cuenta en la base
 * (`count`/`aggregate`/`groupBy`), nunca trayendo filas para contar en JS.
 */

import prisma from '../prisma';

/** Postulaciones de tutor pendientes: total y la más antigua. */
export async function pendingApplicationsSummary() {
  const agg = await prisma.tutorApplication.aggregate({
    where: { status: 'Pending' },
    _count: { _all: true },
    _min: { createdAt: true },
  });
  return { count: agg._count._all, oldestAt: agg._min.createdAt };
}

/**
 * Solicitudes de materia de tutores YA aprobados. Las materias de una
 * postulación todavía abierta también son `Pending`, pero esas se revisan
 * con la postulación, no aquí.
 */
export async function pendingCourseRequestsCount() {
  return prisma.tutorCourse.count({
    where: { status: 'Pending', tutor: { user: { isTutorApproved: true } } },
  });
}

/** Sugerencias de materia pendientes: total y la más antigua. */
export async function pendingSuggestionsSummary() {
  const agg = await prisma.courseSuggestion.aggregate({
    where: { status: 'Pending' },
    _count: { _all: true },
    _min: { createdAt: true },
  });
  return { count: agg._count._all, oldestAt: agg._min.createdAt };
}

/**
 * Inscripciones `PendingApproval` agrupadas por evento, solo de eventos que
 * no han terminado ni se cancelaron. Ordenado por fecha de inicio.
 */
export async function pendingEventApprovalsByEvent({ now = new Date() } = {}) {
  const groups = await prisma.eventRegistration.groupBy({
    by: ['eventId'],
    where: {
      status: 'PendingApproval',
      event: { status: { not: 'Canceled' }, endsAt: { gte: now } },
    },
    _count: { _all: true },
    _min: { createdAt: true },
  });
  if (groups.length === 0) return [];

  const events = await prisma.event.findMany({
    where: { id: { in: groups.map((g) => g.eventId) } },
    select: { id: true, title: true, startsAt: true },
  });
  const byId = new Map(events.map((e) => [e.id, e]));

  return groups
    .map((g) => ({
      eventId: g.eventId,
      title: byId.get(g.eventId)?.title ?? null,
      startsAt: byId.get(g.eventId)?.startsAt ?? null,
      count: g._count._all,
      oldestAt: g._min.createdAt,
    }))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

/** Tutorías que empiezan en la ventana y el tutor todavía no acepta. */
export async function pendingSessionsStartingSoon({ now = new Date(), hours = 24 } = {}) {
  const until = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const agg = await prisma.session.aggregate({
    where: { status: 'Pending', startTimestamp: { gte: now, lte: until } },
    _count: { _all: true },
    _min: { startTimestamp: true },
  });
  return { count: agg._count._all, nextAt: agg._min.startTimestamp };
}
