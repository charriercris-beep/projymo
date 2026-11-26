import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useBrand } from '@/providers/brand';

const ICONS = {
  index: 'home', explorer: 'compass', publier: 'add-circle', communaute: 'people', profil: 'person',
} as const;

export default function TabsLayout() {
  const { colors } = useBrand();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name as keyof typeof ICONS]} color={color as string} size={size} />,
    })}>
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="explorer" options={{ title: 'Explorer' }} />
      <Tabs.Screen name="publier" options={{ title: 'Publier' }} />
      <Tabs.Screen name="communaute" options={{ title: 'Communauté' }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
