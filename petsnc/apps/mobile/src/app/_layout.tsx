import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/providers/auth';
import { BrandProvider, useBrand } from '@/providers/brand';
import { useProfile } from '@/features/queries';
import { isConfigured } from '@/lib/supabase';
import { H1, P, Screen } from '@/ui/kit';

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 2, refetchOnReconnect: true, networkMode: 'offlineFirst' } },
  }));
  return (
    <QueryClientProvider client={client}>
      <BrandProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          {isConfigured ? <Gate /> : <NotConfigured />}
        </AuthProvider>
      </BrandProvider>
    </QueryClientProvider>
  );
}

function NotConfigured() {
  return (
    <Screen>
      <H1>Configuration manquante</H1>
      <P>Définissez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY (voir docs/DEPLOY.md), puis relancez l’app.</P>
    </Screen>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  const { colors } = useBrand();
  const profile = useProfile();
  if (loading || (session && profile.isLoading)) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>;
  }
  const signedIn = !!session;
  const needsOnboarding = signedIn && !!profile.data && !profile.data.commune_id;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsOnboarding}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
