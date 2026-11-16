'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * Sub-pestaña activa de una sección admin, guardada en `?tab=` para que el
 * Inicio pueda enlazar directo a una vista (deep-link) y el botón atrás
 * funcione. La pestaña por defecto no se escribe en la URL.
 *
 * Usa useSearchParams: la página que lo llama debe ir dentro de <Suspense>
 * (lo exige el build de producción en rutas prerenderizadas).
 *
 * @param {string[]} keys      pestañas válidas
 * @param {string}   fallback  pestaña por defecto
 * @returns {[string, (key: string) => void]}
 */
export function useAdminTab(keys, fallback) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = searchParams?.get('tab');
  const urlTab = keys.includes(fromUrl) ? fromUrl : fallback;

  // Estado local además de la URL: la pestaña cambia al instante y sigue
  // funcionando aunque el router no re-renderice (p. ej. en tests). Si la URL
  // cambia por fuera (atrás/adelante, un enlace), manda la URL: se ajusta en
  // render, el patrón de React para derivar estado de props (sin efecto).
  const [local, setLocal] = useState({ tab: urlTab, url: urlTab });
  let tab = local.tab;
  if (local.url !== urlTab) {
    setLocal({ tab: urlTab, url: urlTab });
    tab = urlTab;
  }

  const setTab = useCallback((next) => {
    if (!keys.includes(next)) return;
    setLocal((s) => ({ ...s, tab: next }));
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === fallback) params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [keys, fallback, searchParams, router, pathname]);

  return [tab, setTab];
}

/**
 * Barra segmentada del admin (el estilo de la barra de Usuarios): un
 * contenedor blanco suave y la opción activa en naranja, sin bordes marcados.
 * Una sola pieza para todas las vistas con pestañas o filtros excluyentes.
 *
 * - mode="tabs" (por defecto): role tablist/tab + aria-selected.
 * - mode="filter": role group + botones con aria-pressed (filtros de una
 *   lista que no cambian de vista).
 *
 * `items`: [{ key, label, count? }]. `count` > 0 se muestra como badge.
 * `size`: "md" (pestañas de sección) | "sm" (filtros compactos).
 */
export default function AdminTabs({ items, active, onChange, ariaLabel, mode = 'tabs', size = 'md', className = '' }) {
  const isTabs = mode === 'tabs';
  return (
    <div
      role={isTabs ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--calico-slate-100)] bg-white p-1 ${className}`}
    >
      {items.map(({ key, label, count }) => {
        const selected = active === key;
        return (
          <Button
            key={key}
            type="button"
            variant="ghost"
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? selected : undefined}
            aria-pressed={isTabs ? undefined : selected}
            onClick={() => onChange(key)}
            className={`${size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-4 text-sm'} rounded-[var(--radius-lg)] font-medium whitespace-nowrap shadow-none ${
              selected
                ? 'bg-[var(--calico-orange)] text-white hover:bg-[var(--calico-orange)] hover:text-white'
                : 'text-[var(--calico-slate-700)] hover:bg-[var(--calico-orange-soft)] hover:text-[var(--calico-orange-text)]'
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`ml-0.5 inline-flex min-w-5 justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  selected
                    ? 'bg-white text-[var(--calico-orange-text)]'
                    : 'bg-[var(--calico-orange-soft)] text-[var(--calico-orange-text)]'
                }`}
              >
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

/** Fallback de <Suspense> para las páginas con sub-pestañas. */
export function AdminTabsFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 border-2 border-[var(--calico-orange)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
