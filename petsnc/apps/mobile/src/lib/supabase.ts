import 'react-native';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { chunkString } from './validation';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = /^https?:\/\//.test(url) && anonKey.length > 20;

// Session stockée dans le trousseau sécurisé (Keychain / Keystore), par morceaux
// car une valeur SecureStore est limitée en taille. Aucun secret n'est embarqué : seule la clé « anon » publique.
const CHUNK = 1800;
const memory = new Map<string, string>();
const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return memory.get(key) ?? null;
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (n === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(n); i++) parts.push((await SecureStore.getItemAsync(`${key}.${i}`)) ?? '');
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { memory.set(key, value); return; }
    await secureStorage.removeItem(key);
    const parts = chunkString(value, CHUNK);
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, parts[i]);
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') { memory.delete(key); return; }
    const n = await SecureStore.getItemAsync(`${key}.n`);
    for (let i = 0; i < Number(n ?? 0); i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabase = createClient(isConfigured ? url : 'http://localhost:54321', isConfigured ? anonKey : 'not-configured-not-configured', {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Rafraîchit le jeton uniquement quand l'app est au premier plan (économie de batterie / data).
AppState.addEventListener('change', (state) => {
  if (!isConfigured) return;
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
