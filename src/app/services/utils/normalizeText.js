/**
 * Normaliza texto para búsqueda: minúsculas, sin tildes, espacios colapsados.
 * Misma regla en cualquier motor de búsqueda (cliente hoy, servidor mañana).
 */
export function normalizeText(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
