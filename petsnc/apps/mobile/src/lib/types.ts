export type Species = { id: string; slug: string; name: string; sort: number; is_launch_focus: boolean };
export type Commune = { id: string; name: string; region_id: string; regions: { name: string; sort: number } | null };
export type Profile = {
  id: string; handle: string; display_name: string; bio: string | null; avatar_url: string | null;
  commune_id: string | null; is_private: boolean; status: string;
};
export type Pet = {
  id: string; name: string; species_id: string; breed_text: string | null; birth_date: string | null;
  sex: 'male' | 'female' | null; bio: string | null; avatar_url: string | null; is_private: boolean;
  species?: { name: string; slug: string } | null;
};
