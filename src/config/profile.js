/**
 * Límites de los campos de perfil, compartidos por cliente y servidor.
 *
 * Sin `process.env` a propósito: este módulo lo importan componentes de
 * navegador, y una lectura de entorno aquí llegaría como `undefined` al
 * cliente. Un único número evita que el textarea, la validación de Zod y la
 * columna de Postgres vuelvan a divergir (la divergencia 200/2000/∞ hacía que
 * guardar un bio largo devolviera un 500 opaco).
 */

/** Debe coincidir con `tutor_profiles.bio` → VARCHAR(2000). */
export const TUTOR_BIO_MAX_LENGTH = 2000;
