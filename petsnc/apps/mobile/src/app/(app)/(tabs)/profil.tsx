import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useMyPets, useProfile, useCommunes } from '@/features/queries';
import { useAuth } from '@/providers/auth';
import { ageLabel } from '@/lib/validation';
import { Button, Card, ErrorText, H1, H2, P, Screen } from '@/ui/kit';

export default function Profil() {
  const { signOut, deleteAccount } = useAuth();
  const profile = useProfile();
  const pets = useMyPets();
  const communes = useCommunes();
  const commune = communes.data?.find((c) => c.id === profile.data?.commune_id);

  function confirmDelete() {
    Alert.alert('Supprimer mon compte ?',
      'Votre profil et vos animaux seront masqués immédiatement puis supprimés définitivement. Cette action est irréversible.',
      [{ text: 'Annuler', style: 'cancel' },
       { text: 'Supprimer', style: 'destructive', onPress: async () => {
         const err = await deleteAccount();
         if (err) Alert.alert('Suppression impossible', err);
       } }]);
  }

  return (
    <Screen>
      <H1>{profile.data?.display_name ?? 'Profil'}</H1>
      {profile.data ? <P muted>@{profile.data.handle}{commune ? ` · ${commune.name}` : ''}</P> : null}
      {profile.data?.bio ? <P>{profile.data.bio}</P> : null}
      <H2>Mes animaux</H2>
      {pets.isError ? <ErrorText>Impossible de charger vos animaux.</ErrorText> : null}
      {(pets.data ?? []).map((p) => (
        <Card key={p.id}>
          <H2>{p.name}</H2>
          <P muted>{[p.species?.name, p.breed_text, ageLabel(p.birth_date)].filter(Boolean).join(' · ')}</P>
        </Card>
      ))}
      <Button title="Ajouter un animal" onPress={() => router.push('/(app)/pet/new')} />
      <Button title="Se déconnecter" variant="secondary" onPress={signOut} />
      <Button title="Supprimer mon compte" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}
