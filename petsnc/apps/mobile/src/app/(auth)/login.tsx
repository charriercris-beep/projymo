import { useState } from 'react';
import { Link } from 'expo-router';
import { useAuth } from '@/providers/auth';
import { useBrand } from '@/providers/brand';
import { credentialsSchema } from '@/lib/validation';
import { Button, ErrorText, Field, H1, P, Screen } from '@/ui/kit';

export default function Login() {
  const { signIn } = useAuth();
  const { name, colors } = useBrand();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError(null);
    const err = await signIn(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Screen>
      <H1>{name}</H1>
      <P muted>Le réseau des animaux de Nouvelle-Calédonie.</P>
      <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none"
        keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry
        autoComplete="current-password" textContentType="password" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button title="Se connecter" onPress={submit} loading={busy} />
      <Link href="/(auth)/forgot" style={{ color: colors.primary, textAlign: 'center' }}>Mot de passe oublié ?</Link>
      <Link href="/(auth)/signup" style={{ color: colors.primary, textAlign: 'center', fontWeight: '700' }}>Créer un compte</Link>
    </Screen>
  );
}
