import { render, screen } from '@testing-library/react';
import UniversityBadge from '@/app/components/UniversityBadge/UniversityBadge';

// Real Spanish strings, with {var} interpolation.
jest.mock('@/lib/i18n', () => {
  const es = jest.requireActual('@/lib/i18n/locales/es.json');
  const get = (key) => key.split('.').reduce((o, k) => o?.[k], es) ?? key;
  return {
    useI18n: () => ({
      t: (key, vars = {}) => String(get(key)).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? `{${v}}`),
    }),
  };
});

it('shows the verified university', () => {
  render(<UniversityBadge code="uniandes" />);
  expect(screen.getByRole('img', { name: 'Correo de la Universidad de los Andes verificado' })).toBeInTheDocument();
  expect(screen.getByText('Uniandes verificado')).toBeInTheDocument();
});

it('compact keeps the full name for screen readers only', () => {
  render(<UniversityBadge code="uniandes" compact />);
  expect(screen.getByRole('img', { name: 'Correo de la Universidad de los Andes verificado' })).toBeInTheDocument();
  expect(screen.queryByText('Uniandes verificado')).toBeNull();
});

it.each([null, undefined, '', 'unknown'])('renders nothing for %p', (code) => {
  const { container } = render(<UniversityBadge code={code} />);
  expect(container).toBeEmptyDOMElement();
});
