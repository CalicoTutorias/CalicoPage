'use client';

import { useEffect, useRef } from 'react';

/**
 * Activa el sistema de reveal-on-scroll para cualquier descendiente con el
 * atributo `data-reveal`. Cuando el elemento entra al viewport, su atributo se
 * cambia a `data-reveal="visible"` y los estilos globales (definidos en
 * globals.css) hacen el fade + slide.
 *
 * @param {Array} deps - Dependencias para re-escanear el subárbol. Necesario
 *   cuando los elementos con `data-reveal` se montan después de un fetch
 *   asíncrono (ej. detalle de tutor): pasar `[data]` para que el observer se
 *   reconfigure cuando los datos lleguen. Default `[]` = una sola vez al
 *   montar (suficiente para páginas con contenido estático).
 *
 * @returns {React.RefObject} ref que se debe attachar al contenedor cuyo
 *   subárbol contiene los `[data-reveal]`.
 *
 * @example
 *   // Página estática (Landing):
 *   const rootRef = useScrollReveal();
 *   return <div ref={rootRef}>... <span data-reveal>... </span></div>;
 *
 * @example
 *   // Página con fetch:
 *   const containerRef = useScrollReveal([tutor]);
 *   return <main ref={containerRef}> {tutor && <Section data-reveal />} </main>;
 */
export const useScrollReveal = (deps = []) => {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;
        const els = ref.current.querySelectorAll('[data-reveal]');
        if (!els.length) return;

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    el.dataset.reveal = 'visible';
                    io.unobserve(el);

                    // After the fade-in completes, fully detach the element
                    // from the reveal system. Otherwise the global
                    // `transition: opacity, transform` from globals.css keeps
                    // overriding any page-specific transition (e.g. Tailwind's
                    // `transition-all` for hover shadows), making non-opacity
                    // changes snap instead of animating.
                    const cleanup = (e) => {
                        if (e.target !== el) return;
                        el.removeAttribute('data-reveal');
                        el.removeEventListener('transitionend', cleanup);
                    };
                    el.addEventListener('transitionend', cleanup);
                });
            },
            { threshold: 0.12 },
        );

        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
        // El caller controla cuándo re-escanear vía `deps`. Spread intencional
        // para que el efecto reaccione a cualquier cambio de la lista.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return ref;
};
