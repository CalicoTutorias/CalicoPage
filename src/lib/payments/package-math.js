/**
 * Paquetes de horas — matemática pura (sin I/O), única fuente de la regla.
 *
 * Solo para tutorías manuales. El estudiante acuerda un número de horas con
 * UN tutor en UNA materia y las horas acordadas fijan el nivel:
 *
 *   hasta 2 h   → sin descuento (no hay paquete)
 *   3 a 5 h     → 10 % al estudiante; lo pone todo el tutor
 *   6 a 10 h    → 15 % al estudiante; mitad tutor (7,5 %), mitad Calico (7,5 %)
 *   11 h o más  → 20 % al estudiante; mitad tutor (10 %),  mitad Calico (10 %)
 *
 * Los porcentajes son sobre el precio de lista de cada tutoría. Después del
 * descuento se cobra la comisión normal de Calico sobre la base del tutor:
 *
 *   amount          = lista − descuento                 (lo que paga el estudiante)
 *   tutorPayoutBase = lista − descuento × parte del tutor
 *   tutor recibe      85 % de tutorPayoutBase           (src/lib/payments/fees.js)
 *
 * Wompi, 4x1000 e IVA no cambian: se calculan sobre `amount` como siempre.
 *
 * Si al cerrar el paquete el estudiante tomó menos horas de las que le dan
 * derecho a su nivel, devuelve la diferencia entre el descuento que recibió y
 * el que le corresponde por las horas que sí tomó (`packageSettlement`). Esa
 * devolución es para Calico: el pago al tutor no cambia.
 */

export const MINUTES_PER_HOUR = 60;

/** Horas mínimas para que exista un paquete (con 2 h o menos no hay descuento). */
export const PACKAGE_MIN_HOURS = 3;
/** Tope de cordura para el formulario. */
export const PACKAGE_MAX_HOURS = 100;

/**
 * Niveles de mayor a menor. `minHours` incluido. `tutorSharePercent` es la
 * parte del descuento que pone el tutor (100 = todo, 50 = mitad).
 */
export const PACKAGE_TIERS = Object.freeze([
  Object.freeze({ minHours: 11, discountPercent: 20, tutorSharePercent: 50 }),
  Object.freeze({ minHours: 6, discountPercent: 15, tutorSharePercent: 50 }),
  Object.freeze({ minHours: 3, discountPercent: 10, tutorSharePercent: 100 }),
]);

const NO_DISCOUNT = Object.freeze({ minHours: 0, discountPercent: 0, tutorSharePercent: 0 });

function toInt(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** Nivel que corresponde a un número de minutos (sin descuento por debajo de 3 h). */
export function tierForMinutes(minutes) {
  const hours = Number(minutes) / MINUTES_PER_HOUR;
  if (!Number.isFinite(hours)) return NO_DISCOUNT;
  return PACKAGE_TIERS.find((tier) => hours >= tier.minHours) ?? NO_DISCOUNT;
}

export function tierForHours(hours) {
  return tierForMinutes(Number(hours) * MINUTES_PER_HOUR);
}

/** Horas enteras válidas para crear un paquete. */
export function isValidPackageHours(hours) {
  const n = Number(hours);
  return Number.isInteger(n) && n >= PACKAGE_MIN_HOURS && n <= PACKAGE_MAX_HOURS;
}

/**
 * Desglose de UNA tutoría del paquete.
 *
 * @param {{ originalAmount: number, discountPercent: number, tutorSharePercent: number }} args
 * @returns {{ originalAmount, discountAmount, finalAmount, tutorPayoutBase,
 *             tutorDiscount, calicoDiscount }}
 */
export function packagePricing({ originalAmount, discountPercent, tutorSharePercent }) {
  const original = Math.max(0, toInt(originalAmount));
  const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const share = Math.min(100, Math.max(0, Number(tutorSharePercent) || 0));

  const discountAmount = Math.round((original * pct) / 100);
  const tutorDiscount = Math.round((discountAmount * share) / 100);
  return {
    originalAmount: original,
    discountAmount,
    finalAmount: original - discountAmount,
    tutorPayoutBase: original - tutorDiscount,
    tutorDiscount,
    calicoDiscount: discountAmount - tutorDiscount,
  };
}

/**
 * Lo que el estudiante debe devolver al cerrar un paquete.
 *
 * @param {{ discountPercent: number, payments: Array<{ originalAmount, discountAmount, minutes }> }} args
 *   `payments`: las tutorías del paquete que sí se tomaron (sin canceladas).
 * @returns {{ usedMinutes, actualTier, settlementAmount }}
 */
export function packageSettlement({ discountPercent, payments = [] }) {
  const usedMinutes = payments.reduce((acc, p) => acc + Math.max(0, toInt(p.minutes)), 0);
  const actualTier = tierForMinutes(usedMinutes);
  if (actualTier.discountPercent >= Number(discountPercent)) {
    return { usedMinutes, actualTier, settlementAmount: 0 };
  }
  const settlementAmount = payments.reduce((acc, p) => {
    const deserved = Math.round((toInt(p.originalAmount) * actualTier.discountPercent) / 100);
    return acc + Math.max(0, toInt(p.discountAmount) - deserved);
  }, 0);
  return { usedMinutes, actualTier, settlementAmount };
}
