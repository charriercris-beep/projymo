// Identité visuelle : valeurs par défaut, remplacées au démarrage par app_settings.brand
// (modifiable depuis le back-office sans rebuild).
export type Brand = {
  name: string;
  logo_url: string | null;
  colors: {
    primary: string; secondary: string; background: string; text: string;
    muted: string; card: string; border: string; danger: string;
  };
};

export const defaultBrand: Brand = {
  name: 'PetsNC',
  logo_url: null,
  colors: {
    primary: '#E8743B', secondary: '#2F6F6D', background: '#FFF9F3', text: '#2B2B2B',
    muted: '#6B6B6B', card: '#FFFFFF', border: '#EADFD3', danger: '#C0392B',
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Fusionne une configuration distante en ignorant toute valeur invalide. */
export function mergeBrand(remote: unknown): Brand {
  const r = (remote ?? {}) as Partial<Brand> & { colors?: Record<string, unknown> };
  const colors = { ...defaultBrand.colors };
  for (const k of Object.keys(colors) as (keyof Brand['colors'])[]) {
    const v = r.colors?.[k];
    if (typeof v === 'string' && HEX.test(v)) colors[k] = v;
  }
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : defaultBrand.name,
    logo_url: typeof r.logo_url === 'string' && r.logo_url.startsWith('https://') ? r.logo_url : null,
    colors,
  };
}
