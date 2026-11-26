import { useSpecies } from '@/features/queries';
import { Card, Empty, H1, H2, P, Screen } from '@/ui/kit';

export default function Communaute() {
  const species = useSpecies();
  return (
    <Screen>
      <H1>Communauté</H1>
      <P muted>Un espace par espèce. Les forums ouvrent en Phase 3.</P>
      {(species.data ?? []).map((s) => (
        <Card key={s.id}>
          <H2>{s.name}</H2>
          {s.is_launch_focus ? <P muted>Espace prioritaire au lancement</P> : null}
        </Card>
      ))}
      {species.isError ? <Empty title="Hors connexion" text="Reconnectez-vous pour charger les catégories." /> : null}
    </Screen>
  );
}
