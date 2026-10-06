const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function buildEventSlug(title, rng = Math.random) {
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += SUFFIX_CHARS[Math.floor(rng() * SUFFIX_CHARS.length)];
  }
  return `${slugify(title) || 'evento'}-${suffix}`;
}
