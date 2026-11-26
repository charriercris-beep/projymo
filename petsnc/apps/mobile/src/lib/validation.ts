import { z } from 'zod';

// Ces règles reflètent les contraintes de la base (supabase/migrations/0001_foundations.sql).
export const HANDLE_RE = /^[a-z0-9_.]{3,30}$/;

export const profileSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE, 'Pseudonyme : 3 à 30 caractères (a-z, 0-9, _ .)'),
  display_name: z.string().trim().min(1, 'Nom requis').max(60),
  bio: z.string().trim().max(500).optional(),
});

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(72),
});

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const petSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(50),
  species_id: z.string().uuid('Choisissez une espèce'),
  breed_text: z.string().trim().max(80).optional(),
  birth_date: z.string().trim().optional().refine(
    (v) => !v || (isoDate.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date()),
    'Date invalide (AAAA-MM-JJ, pas dans le futur)',
  ),
  sex: z.enum(['male', 'female']).optional(),
  bio: z.string().trim().max(1000).optional(),
});
export type PetInput = z.infer<typeof petSchema>;

/** Âge lisible en français : « 3 mois », « 1 an », « 4 ans ». */
export function ageLabel(birthDate: string | null | undefined, now: Date = new Date()): string | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime()) || b > now) return null;
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 1) return 'moins d’1 mois';
  if (months < 24) return `${months} mois`;
  const years = Math.floor(months / 12);
  return `${years} ans`;
}

/** Découpe une chaîne en morceaux (SecureStore limite la taille d'une valeur). */
export function chunkString(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [''];
}
