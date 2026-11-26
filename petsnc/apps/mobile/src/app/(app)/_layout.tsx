import { Stack } from 'expo-router';
import { useBrand } from '@/providers/brand';

export default function AppLayout() {
  const { colors } = useBrand();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pet/new" options={{ title: 'Nouvel animal', presentation: 'modal' }} />
    </Stack>
  );
}
