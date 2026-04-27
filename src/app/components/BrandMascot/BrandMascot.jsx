'use client';

import Image from 'next/image';

/**
 * Mascota Calico para pantallas de verificación / confirmación (marca, tono positivo).
 * Imagen en /public/happy-calico.png — tamaño contenido pero visible.
 */
export function BrandMascot({
  className = '',
  alt = 'Calico',
}) {
  const decorative = alt === '';
  return (
    <div
      className={`flex justify-center ${className}`}
      {...(decorative ? { 'aria-hidden': true } : {})}
    >
      <Image
        src="/happy-calico.png"
        alt={decorative ? '' : alt}
        width={180}
        height={180}
        priority={false}
      />
    </div>
  );
}
