/**
 * Session package service — paquetes de horas de tutorías manuales.
 *
 * Un paquete es un acuerdo de N horas entre un estudiante y Calico con UN tutor
 * en UNA materia. Se crea desde el formulario de tutoría manual junto con la
 * primera tutoría y las siguientes lo eligen. Las horas acordadas fijan el
 * nivel (descuento al estudiante y parte que pone el tutor) y ese nivel se copia
 * en el paquete. La regla vive en src/lib/payments/package-math.js.
 *
 * Al cerrarlo se calcula cuánto debe devolver el estudiante si tomó menos horas
 * de las que le daban derecho a su nivel. Ese cobro entra a Finanzas como
 * "Otro ingreso"; el pago al tutor no cambia.
 */

import * as packageRepository from '../repositories/session-package.repository';
import * as auditService from './admin-audit.service';
import { invalidateAllMetrics } from './admin-metrics.service';
import {
  MINUTES_PER_HOUR,
  isValidPackageHours,
  packagePricing,
  packageSettlement,
  tierForHours,
} from '../payments/package-math';

const { ADMIN_ACTIONS } = auditService;
const { DROPPED_SESSION_STATUSES } = packageRepository;

export function packageError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function sessionMinutes(session) {
  if (!session?.startTimestamp || !session?.endTimestamp) return 0;
  return Math.round((new Date(session.endTimestamp) - new Date(session.startTimestamp)) / 60_000);
}

/** Payments of the package whose session still counts (not canceled/rejected). */
function activePayments(pkg) {
  return (pkg.payments ?? []).filter((p) => !DROPPED_SESSION_STATUSES.includes(p.session?.status));
}

function usedMinutesOf(pkg) {
  return activePayments(pkg).reduce((acc, p) => acc + sessionMinutes(p.session), 0);
}

function settlementOf(pkg) {
  return packageSettlement({
    discountPercent: Number(pkg.discountPercent),
    payments: activePayments(pkg).map((p) => ({
      originalAmount: Number(p.originalAmount ?? p.amount),
      discountAmount: Number(p.discountAmount ?? 0),
      minutes: sessionMinutes(p.session),
    })),
  });
}

/** Explicit shape for the admin. */
export function serializePackage(pkg) {
  const usedMinutes = pkg.status === 'CLOSED' && pkg.usedMinutes != null ? pkg.usedMinutes : usedMinutesOf(pkg);
  const settlement = pkg.status === 'CLOSED'
    ? Number(pkg.settlementAmount ?? 0)
    : settlementOf(pkg).settlementAmount;
  const counted = activePayments(pkg);
  return {
    id: pkg.id,
    status: pkg.status,
    committedHours: pkg.committedMinutes / MINUTES_PER_HOUR,
    usedHours: usedMinutes / MINUTES_PER_HOUR,
    remainingHours: Math.max(0, pkg.committedMinutes - usedMinutes) / MINUTES_PER_HOUR,
    discountPercent: Number(pkg.discountPercent),
    tutorSharePercent: Number(pkg.tutorSharePercent),
    notes: pkg.notes ?? null,
    createdAt: pkg.createdAt,
    closedAt: pkg.closedAt ?? null,
    // Open: what the student would owe if it closed today. Closed: what was recorded.
    settlementAmount: settlement,
    student: pkg.student && {
      id: pkg.student.id,
      name: pkg.student.name,
      email: pkg.student.email,
      external: pkg.student.kind === 'ExternalTemporary',
    },
    tutor: pkg.tutor,
    course: pkg.course,
    totals: {
      sessions: counted.length,
      charged: counted.reduce((acc, p) => acc + Number(p.amount), 0),
      discount: counted.reduce((acc, p) => acc + Number(p.discountAmount ?? 0), 0),
    },
  };
}

export async function listPackages() {
  const rows = await packageRepository.findAll();
  return rows.map(serializePackage);
}

/** Pricing of one session of `pkg` at `originalAmount` (list price). */
export function pricingFor(pkg, originalAmount) {
  return packagePricing({
    originalAmount,
    discountPercent: Number(pkg.discountPercent),
    tutorSharePercent: Number(pkg.tutorSharePercent),
  });
}

/**
 * The package a new manual session uses: it must be active, of this same
 * student, tutor and course, and have the hours left for this duration.
 */
export async function resolveForBooking({ packageId, studentId, tutorId, courseId, durationMinutes }) {
  const pkg = await packageRepository.findById(packageId);
  if (!pkg) throw packageError('PACKAGE_NOT_FOUND');
  if (pkg.status !== 'ACTIVE') throw packageError('PACKAGE_CLOSED');
  if (pkg.student.id !== studentId || pkg.tutor.id !== tutorId || pkg.course.id !== courseId) {
    throw packageError('PACKAGE_MISMATCH');
  }
  if (usedMinutesOf(pkg) + durationMinutes > pkg.committedMinutes) throw packageError('PACKAGE_HOURS_EXCEEDED');
  return pkg;
}

/** A new package, created together with its first session. */
export async function createForBooking({ adminId, studentId, tutorId, courseId, hours, durationMinutes }) {
  if (!isValidPackageHours(hours)) throw packageError('PACKAGE_INVALID_HOURS');
  const committedMinutes = hours * MINUTES_PER_HOUR;
  if (durationMinutes > committedMinutes) throw packageError('PACKAGE_HOURS_EXCEEDED');
  const tier = tierForHours(hours);
  return packageRepository.create({
    studentId,
    tutorId,
    courseId,
    committedMinutes,
    discountPercent: tier.discountPercent,
    tutorSharePercent: tier.tutorSharePercent,
    createdById: adminId,
  });
}

/** Undo a package whose first booking failed. */
export async function discardUnused(packageId) {
  await packageRepository.deleteIfUnused(packageId);
}

/**
 * Close a package: no more sessions can use it. Records the hours taken and
 * what the student owes back when those hours fall into a lower tier.
 */
export async function closePackage({ adminId, id, request }) {
  const pkg = await packageRepository.findById(id);
  if (!pkg) throw packageError('PACKAGE_NOT_FOUND');
  if (pkg.status !== 'ACTIVE') throw packageError('PACKAGE_CLOSED');

  const { usedMinutes, actualTier, settlementAmount } = settlementOf(pkg);
  const moved = await packageRepository.closeIfActive(id, { closedById: adminId, usedMinutes, settlementAmount });
  if (!moved) throw packageError('PACKAGE_CLOSED');

  invalidateAllMetrics();
  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.SESSION_PACKAGE_CLOSE,
    targetType: 'SessionPackage',
    targetId: id,
    payload: {
      committedMinutes: pkg.committedMinutes,
      usedMinutes,
      discountPercent: Number(pkg.discountPercent),
      actualDiscountPercent: actualTier.discountPercent,
      settlementAmount,
    },
    request,
  });

  return serializePackage(await packageRepository.findById(id));
}

