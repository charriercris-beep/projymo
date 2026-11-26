import { useState } from 'react';
import { Link } from 'expo-router';
import { useAuth } from '@/providers/auth';
import { useBrand } from '@/providers/brand';
import { credentialsSchema } from '@/lib/validation';
import { Button, ErrorText, Field, H1, P, Screen } from '@/ui/kit';

export default function Forgot() {
  const { resetPassword } = useAuth();
  const { colors } = useBrand();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = credentialsSchema.shape.email.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError(null);
    const err = await resetPassword(parsed.data);
    setBusy(false);
    if (err) setError(err); else setDone(true);
  }
  return (
    <Screen>
      <H1>Mot de passe oublié</H1>
      {done ? <P>Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.</P> : <>
        <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button title="Envoyer le lien" onPress={submit} loading={busy} />
      </>}
      <Link href="/(auth)/login" style={{ color: colors.primary, textAlign: 'center' }}>Retour</Link>
    </Screen>
  );
}
