import { useState } from 'react';
import { View } from 'react-native';
import { useCommunes, useSaveOnboarding, useSpecies } from '@/features/queries';
import { Button, Chip, ErrorText, H1, H2, P, Screen } from '@/ui/kit';

export default function Onboarding() {
  const species = useSpecies();
  const communes = useCommunes();
  const save = useSaveOnboarding();
  const [communeId, setCommuneId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const byRegion = new Map<string, { sort: number; items: NonNullable<typeof communes.data> }>();
  for (const c of communes.data ?? []) {
    const key = c.regions?.name ?? 'Autres';
    const g = byRegion.get(key) ?? { sort: c.regions?.sort ?? 99, items: [] };
    g.items.push(c); byRegion.set(key, g);
  }
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen>
      <H1>Bienvenue !</H1>
      <P muted>Deux questions rapides pour personnaliser votre fil. Votre adresse exacte n’est jamais demandée.</P>
      <H2>Quels animaux vous intéressent ?</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(species.data ?? []).map((s) => (
          <Chip key={s.id} label={s.name} selected={picked.includes(s.id)} onPress={() => toggle(s.id)} />
        ))}
      </View>
      <H2>Dans quelle commune habitez-vous ?</H2>
      {[...byRegion.entries()].sort((a, b) => a[1].sort - b[1].sort).map(([region, g]) => (
        <View key={region}>
          <P muted style={{ marginBottom: 6 }}>{region}</P>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {g.items.map((c) => <Chip key={c.id} label={c.name} selected={communeId === c.id} onPress={() => setCommuneId(c.id)} />)}
          </View>
        </View>
      ))}
      {save.error ? <ErrorText>Enregistrement impossible. Réessayez.</ErrorText> : null}
      <Button title="Continuer" disabled={!communeId} loading={save.isPending}
        onPress={() => communeId && save.mutate({ communeId, speciesIds: picked })} />
    </Screen>
  );
}
