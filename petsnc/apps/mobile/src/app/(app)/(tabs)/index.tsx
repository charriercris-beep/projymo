import { useMyPets, useProfile } from '@/features/queries';
import { Empty, H1, P, Screen } from '@/ui/kit';

export default function Home() {
  const profile = useProfile();
  const pets = useMyPets();
  return (
    <Screen>
      <H1>Bonjour {profile.data?.display_name ?? ''} 👋</H1>
      {pets.data?.length === 0 ? (
        <Empty title="Présentez votre compagnon" text="Ajoutez votre premier animal depuis l’onglet Profil." />
      ) : null}
      <Empty title="Le fil d’actualité arrive bientôt" text="Publications, stories et vidéos sont développées dans la prochaine étape (Phase 2)." />
      <P muted>Cette version contient les profils, les animaux et les catégories.</P>
    </Screen>
  );
}
