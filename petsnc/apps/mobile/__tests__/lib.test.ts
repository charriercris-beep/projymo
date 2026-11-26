import { mergeBrand, defaultBrand } from '../src/lib/brand';
import { ageLabel, chunkString, credentialsSchema, petSchema, profileSchema } from '../src/lib/validation';

describe('validation', () => {
  test('e-mail et mot de passe', () => {
    expect(credentialsSchema.safeParse({ email: ' A@B.com ', password: '12345678' }).data?.email).toBe('a@b.com');
    expect(credentialsSchema.safeParse({ email: 'nope', password: '12345678' }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: 'a@b.com', password: 'court' }).success).toBe(false);
  });
  test('pseudonyme', () => {
    expect(profileSchema.safeParse({ handle: 'Rex_NC', display_name: 'R' }).data?.handle).toBe('rex_nc');
    expect(profileSchema.safeParse({ handle: 'a b', display_name: 'R' }).success).toBe(false);
    expect(profileSchema.safeParse({ handle: 'ab', display_name: 'R' }).success).toBe(false);
  });
  test('animal', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(petSchema.safeParse({ name: 'Rex', species_id: id }).success).toBe(true);
    expect(petSchema.safeParse({ name: '', species_id: id }).success).toBe(false);
    expect(petSchema.safeParse({ name: 'Rex', species_id: 'x' }).success).toBe(false);
    expect(petSchema.safeParse({ name: 'Rex', species_id: id, birth_date: '2999-01-01' }).success).toBe(false);
    expect(petSchema.safeParse({ name: 'Rex', species_id: id, birth_date: '2020-02-31x' }).success).toBe(false);
    expect(petSchema.safeParse({ name: 'Rex', species_id: id, birth_date: '2020-02-10', sex: 'male' }).success).toBe(true);
    expect(petSchema.safeParse({ name: 'Rex', species_id: id, sex: 'x' }).success).toBe(false);
  });
  test('âge', () => {
    const now = new Date('2026-11-26');
    expect(ageLabel('2026-11-10', now)).toBe('moins d’1 mois');
    expect(ageLabel('2026-08-26', now)).toBe('3 mois');
    expect(ageLabel('2022-11-26', now)).toBe('4 ans');
    expect(ageLabel('2999-01-01', now)).toBeNull();
    expect(ageLabel(null, now)).toBeNull();
  });
  test('découpage pour le trousseau', () => {
    expect(chunkString('abcdefg', 3)).toEqual(['abc', 'def', 'g']);
    expect(chunkString('', 3)).toEqual(['']);
    expect(chunkString('x'.repeat(5000), 1800).join('')).toHaveLength(5000);
  });
});

describe('marque', () => {
  test('valeurs par défaut', () => expect(mergeBrand(null)).toEqual(defaultBrand));
  test('fusion valide', () => {
    const b = mergeBrand({ name: ' Autre ', colors: { primary: '#112233' }, logo_url: 'https://x/y.png' });
    expect(b.name).toBe('Autre'); expect(b.colors.primary).toBe('#112233'); expect(b.logo_url).toBe('https://x/y.png');
  });
  test('valeurs invalides ignorées', () => {
    const b = mergeBrand({ name: 42, colors: { primary: 'rouge', secondary: '#12' }, logo_url: 'http://x' });
    expect(b.colors.primary).toBe(defaultBrand.colors.primary);
    expect(b.colors.secondary).toBe(defaultBrand.colors.secondary);
    expect(b.logo_url).toBeNull(); expect(b.name).toBe('PetsNC');
  });
});
