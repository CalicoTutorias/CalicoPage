import { universityByCode, universityForEmail } from '@/lib/universities/universities';

describe('universityForEmail', () => {
  it('matches the exact domain, case-insensitive', () => {
    expect(universityForEmail('A.Perez@UNIANDES.edu.co')?.code).toBe('uniandes');
  });

  it.each(['a@gmail.com', 'a@alumni.uniandes.edu.co', 'a@uniandes.edu.co.evil.com', 'uniandes.edu.co', '', null, 42])(
    'does not match %p',
    (email) => expect(universityForEmail(email)).toBeNull(),
  );
});

it('universityByCode only knows the configured codes', () => {
  expect(universityByCode('uniandes')?.shortName).toBe('Uniandes');
  expect(universityByCode('nope')).toBeNull();
  expect(universityByCode(null)).toBeNull();
});
