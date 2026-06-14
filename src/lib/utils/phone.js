/**
 * Phone-number helpers shared by the registration form and the
 * apply-tutor form.
 *
 * We store phones as `<dialCode> <local>` (e.g. "+57 3001234567") in
 * `users.phone_number`. The split helper recovers the two pieces so the
 * UI can edit them independently (country dropdown + local input).
 */

export const PHONE_COUNTRY_CODES = [
  { code: '+57', label: 'Colombia (+57)' },
  { code: '+1', label: 'EE.UU. / Canadá (+1)' },
  { code: '+52', label: 'México (+52)' },
  { code: '+34', label: 'España (+34)' },
  { code: '+54', label: 'Argentina (+54)' },
  { code: '+56', label: 'Chile (+56)' },
  { code: '+51', label: 'Perú (+51)' },
  { code: '+593', label: 'Ecuador (+593)' },
  { code: '+55', label: 'Brasil (+55)' },
  { code: '+58', label: 'Venezuela (+58)' },
  { code: '+507', label: 'Panamá (+507)' },
];

export const DEFAULT_PHONE_COUNTRY_CODE = '+57';

/**
 * Split a stored phone string into { code, local }. Picks the longest
 * matching dial code from PHONE_COUNTRY_CODES (so "+1" doesn't shadow
 * "+507"). Falls back to the default code if no prefix matches.
 *
 * @param {string} full - e.g. "+57 3001234567" or "3001234567"
 * @returns {{ code: string, local: string }}
 */
export function splitPhone(full) {
  if (!full) return { code: DEFAULT_PHONE_COUNTRY_CODE, local: '' };
  const trimmed = String(full).trim();

  const sortedCodes = [...PHONE_COUNTRY_CODES].sort(
    (a, b) => b.code.length - a.code.length,
  );
  for (const { code } of sortedCodes) {
    if (trimmed.startsWith(code)) {
      return { code, local: trimmed.slice(code.length).trim() };
    }
  }

  return { code: DEFAULT_PHONE_COUNTRY_CODE, local: trimmed };
}

/**
 * Concatenate a country code and local digits back into the stored
 * format. Returns an empty string if `local` is empty (so we never
 * persist a country code by itself).
 */
export function joinPhone(code, local) {
  const cleanLocal = (local || '').trim();
  if (!cleanLocal) return '';
  return `${code} ${cleanLocal}`;
}

/**
 * Convert a stored/display phone value into the canonical lookup key used by
 * admin manual sessions. If no explicit country code is present, assume the
 * product default (+57) because the UI stores local Colombian numbers that way.
 *
 * @param {string|null|undefined} full
 * @returns {string|null} e.g. "+573001234567"
 */
export function normalizePhoneNumber(full) {
  if (!full) return null;
  const trimmed = String(full).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 18) return null;

  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }

  const defaultDigits = DEFAULT_PHONE_COUNTRY_CODE.replace(/\D/g, '');
  return `+${defaultDigits}${digits}`;
}
