'use client';

import Image from 'next/image';

/**
 * Mascota Calico para pantallas de verificación / confirmación (marca, tono positivo).
 * Imagen en /public/happy-calico.png — tamaño contenido pero visible.
 */
export function BrandMascot({
  className = '',
  /** Vacío = decorativa (junto al logo); texto = lectura en voz */
  alt = 'Calico',
}) {
  const decorative = alt === '';
  return (
    <div
      className={`flex justify-center pointer-events-none select-none ${className}`}
      {...(decorative ? { 'aria-hidden': true } : {})}
    >
      <Image
        src="/happy-calico.png"
        alt={decorative ? '' : alt}
        width={128}
        height={128}
        className="h-[4.75rem] w-auto max-w-[8.5rem] object-contain md:h-[5.25rem] md:max-w-[9.5rem]"
        priority={false}
      />
    </div>
  );
}
