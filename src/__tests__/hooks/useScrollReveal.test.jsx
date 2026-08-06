/**
 * Regresión: la página de perfil se quedaba en blanco tras guardar.
 *
 * `refreshUserData()` pone el contexto de auth en `loading`, la página devuelve
 * el spinner y desmonta todo el árbol. Al volver, los `[data-reveal]` renacen
 * con `opacity: 0` (globals.css) y solo el IntersectionObserver los hace
 * visibles. Si el efecto no se re-ejecuta, el observer sigue apuntando a los
 * nodos ya destruidos y el contenido nuevo nunca se revela: pantalla en blanco
 * permanente, con el contenido presente en el DOM pero 100% transparente.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { useScrollReveal } from '@/app/hooks/useScrollReveal';

let observed;

beforeEach(() => {
  observed = [];
  global.IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: (el) => observed.push(el),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});

/**
 * Reproduce la estructura de la página: mientras `loading` es true se devuelve
 * un spinner (sin contenedor), y al volver a false se remonta el subárbol.
 */
function Harness({ loading, deps }) {
  const ref = useScrollReveal(deps);
  if (loading) return <div data-testid="spinner" />;
  return (
    <div ref={ref}>
      <section data-reveal data-testid="card" />
    </div>
  );
}

describe('useScrollReveal', () => {
  it('observa los elementos [data-reveal] al montar', () => {
    const { getByTestId } = render(<Harness loading={false} deps={[false]} />);

    expect(observed).toHaveLength(1);
    expect(observed[0]).toBe(getByTestId('card'));
  });

  it('vuelve a observar los nodos nuevos cuando un remount está cubierto por las deps', () => {
    const { rerender, getByTestId } = render(<Harness loading={false} deps={[false]} />);
    const primerNodo = getByTestId('card');
    expect(observed).toContain(primerNodo);

    // El árbol se desmonta (spinner) y vuelve — como al guardar el perfil.
    rerender(<Harness loading deps={[true]} />);
    rerender(<Harness loading={false} deps={[false]} />);

    const nodoNuevo = getByTestId('card');
    expect(nodoNuevo).not.toBe(primerNodo); // se remontó de verdad
    expect(observed).toContain(nodoNuevo); // ...y el observer lo recogió
  });

  it('deja el contenido sin observar si el remount NO está en las deps (el bug)', () => {
    // `deps` constante = lo que hacía la página antes del fix: el ciclo de
    // loading no estaba en las dependencias.
    const { rerender, getByTestId } = render(<Harness loading={false} deps={['constante']} />);
    const primerNodo = getByTestId('card');

    rerender(<Harness loading deps={['constante']} />);
    rerender(<Harness loading={false} deps={['constante']} />);

    const nodoNuevo = getByTestId('card');
    expect(nodoNuevo).not.toBe(primerNodo);
    // Nadie observa el nodo nuevo → se queda en opacity: 0 para siempre.
    expect(observed).not.toContain(nodoNuevo);
  });
});
