import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useCreatePet, useProfile, useSpecies } from '@/features/queries';
import { petSchema } from '@/lib/validation';
import { Button, Chip, ErrorText, Field, H2, Screen } from '@/ui/kit';

export default function NewPet() {
  const species = useSpecies();
  const profile = useProfile();
  const create = useCreatePet();
  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [breed, setBreed] = useState('');
  const [birth, setBirth] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | undefined>();
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = petSchema.safeParse({ name, species_id: speciesId, breed_text: breed, birth_date: birth, sex, bio });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError(null);
    create.mutate({ ...parsed.data, commune_id: profile.data?.commune_id ?? null }, {
      onSuccess: () => router.back(),
      onError: () => setError('Enregistrement impossible. Réessayez.'),
    });
  }

  return (
    <Screen>
      <Field label="Nom" value={name} onChangeText={setName} maxLength={50} />
      <H2>Espèce</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(species.data ?? []).map((s) => <Chip key={s.id} label={s.name} selected={speciesId === s.id} onPress={() => setSpeciesId(s.id)} />)}
      </View>
      <Field label="Race (facultatif)" value={breed} onChangeText={setBreed} maxLength={80} />
      <Field label="Date de naissance (AAAA-MM-JJ, facultatif)" value={birth} onChangeText={setBirth}
        keyboardType="numbers-and-punctuation" maxLength={10} placeholder="2021-06-15" />
      <H2>Sexe (facultatif)</H2>
      <View style={{ flexDirection: 'row' }}>
        <Chip label="Mâle" selected={sex === 'male'} onPress={() => setSex(sex === 'male' ? undefined : 'male')} />
        <Chip label="Femelle" selected={sex === 'female'} onPress={() => setSex(sex === 'female' ? undefined : 'female')} />
      </View>
      <Field label="Présentation (facultatif)" value={bio} onChangeText={setBio} multiline maxLength={1000} style={{ minHeight: 90 }} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button title="Enregistrer" onPress={submit} loading={create.isPending} />
    </Screen>
  );
}
