/**
 * MetricInfo se usa dentro de <p> (KpiCard), <th> y títulos: su tooltip solo
 * puede tener elementos de texto, o React avisa de anidamiento inválido y la
 * hidratación falla en el navegador.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import KpiCard from '@/app/home/admin/_components/KpiCard';
import MetricInfo from '@/app/home/admin/_components/MetricInfo';

it('renders its tooltip inside a KpiCard label without invalid DOM nesting', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <KpiCard
      icon={Users}
      label="Tutores activos"
      value={7}
      info={<MetricInfo baseKey="admin.growth.info.activeTutors" />}
    />,
  );

  fireEvent.mouseEnter(screen.getByRole('button'));

  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.querySelector('div, p')).toBeNull();
  expect(error.mock.calls.flat().join(' ')).not.toMatch(/cannot be a descendant|cannot contain a nested/);
  error.mockRestore();
});
