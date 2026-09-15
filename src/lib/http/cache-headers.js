/**
 * Cabeceras de caché para respuestas públicas (sin auth, iguales para todos).
 *
 * Vercel solo guarda en su CDN respuestas con `s-maxage`; el navegador nunca
 * recibe esa directiva (Vercel la retira si no hay `CDN-Cache-Control`), así
 * que el cliente sigue viendo datos frescos tras cada navegación y solo se
 * ahorra la invocación de la función mientras el objeto vive en el edge.
 *
 * Solo tiene efecto si la petición NO lleva `Authorization`: Vercel nunca
 * cachea esas. Por eso los llamadores públicos usan `publicFetch`, no
 * `authFetch`.
 *
 * @param {number} maxAge  segundos que la CDN sirve la copia sin ir al origen
 * @param {number} [staleWhileRevalidate] segundos extra sirviendo la copia
 *   vencida mientras se regenera en segundo plano
 */
export function publicCacheHeaders(maxAge, staleWhileRevalidate = maxAge * 5) {
  return {
    'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
  };
}
