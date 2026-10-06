const { slugify, buildEventSlug } = require('@/lib/utils/slug');

it('slugifies accents and punctuation', () => {
  expect(slugify('Repaso de Cálculo — Parcial 2!')).toBe('repaso-de-calculo-parcial-2');
});
it('appends a 4-char suffix', () => {
  expect(buildEventSlug('Hola', () => 0.5)).toMatch(/^hola-[a-z0-9]{4}$/);
});
it('falls back for empty titles', () => {
  expect(buildEventSlug('', () => 0.5)).toMatch(/^evento-[a-z0-9]{4}$/);
});
it('caps long titles at 60 chars before the suffix', () => {
  expect(buildEventSlug('a'.repeat(100), () => 0.5)).toMatch(/^a{60}-[a-z0-9]{4}$/);
});
