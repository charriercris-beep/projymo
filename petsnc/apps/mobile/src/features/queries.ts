import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import type { Commune, Pet, Profile, Species } from '@/lib/types';
import type { PetInput } from '@/lib/validation';

const DAY = 24 * 60 * 60 * 1000;

// Référentiels : changent rarement → cache long (économie de data en Nouvelle-Calédonie).
export function useSpecies() {
  return useQuery({
    queryKey: ['species'], staleTime: DAY, gcTime: 7 * DAY,
    queryFn: async (): Promise<Species[]> => {
      const { data, error } = await supabase.from('species').select('id,slug,name,sort,is_launch_focus')
        .eq('is_active', true).order('sort');
      if (error) throw error;
      return data;
    },
  });
}

export function useCommunes() {
  return useQuery({
    queryKey: ['communes'], staleTime: DAY, gcTime: 7 * DAY,
    queryFn: async (): Promise<Commune[]> => {
      const { data, error } = await supabase.from('communes').select('id,name,region_id,regions(name,sort)').order('name');
      if (error) throw error;
      return data as unknown as Commune[];
    },
  });
}

export function useProfile() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['profile', uid], enabled: !!uid,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles')
        .select('id,handle,display_name,bio,avatar_url,commune_id,is_private,status').eq('id', uid!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyPets() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['pets', uid], enabled: !!uid,
    queryFn: async (): Promise<Pet[]> => {
      const { data, error } = await supabase.from('pets')
        .select('id,name,species_id,breed_text,birth_date,sex,bio,avatar_url,is_private,species(name,slug)')
        .eq('owner_id', uid!).is('deleted_at', null).order('created_at');
      if (error) throw error;
      return data as unknown as Pet[];
    },
  });
}

export function useSaveOnboarding() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { communeId: string; speciesIds: string[] }) => {
      const uid = session!.user.id;
      const { error } = await supabase.from('profiles').update({ commune_id: v.communeId }).eq('id', uid);
      if (error) throw error;
      const del = await supabase.from('profile_species_interests').delete().eq('profile_id', uid);
      if (del.error) throw del.error;
      if (v.speciesIds.length) {
        const ins = await supabase.from('profile_species_interests')
          .insert(v.speciesIds.map((species_id) => ({ profile_id: uid, species_id })));
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useCreatePet() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PetInput & { commune_id?: string | null }) => {
      const { error } = await supabase.from('pets').insert({
        owner_id: session!.user.id,
        name: v.name, species_id: v.species_id,
        breed_text: v.breed_text || null, birth_date: v.birth_date || null,
        sex: v.sex ?? null, bio: v.bio || null, commune_id: v.commune_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  });
}
