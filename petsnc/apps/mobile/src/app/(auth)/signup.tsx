import { useState } from 'react';
import { Link } from 'expo-router';
import { useAuth } from '@/providers/auth';
import { useBrand } from '@/providers/brand';
import { credentialsSchema } from '@/lib/validation';
import { Button, ErrorText, Field, H1, P, Screen } from '@/ui/kit';

export default function Signup() {
  const { signUp } = useAuth();
  const { colors } = useBrand();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (!displayName.trim()) { setError('Indiquez votre prénom ou pseudo.'); return; }
    setBusy(true); setError(null);
    const err = await signUp(parsed.data.email, parsed.data.password, displayName.trim());
    setBusy(false);
    if (err) setError(err); else setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <H1>Vérifiez vos e-mails</H1>
        <P>Si l’adresse est valide, un lien de confirmation vient d’être envoyé. Ouvrez-le puis revenez vous connecter.</P>
        <Link href="/(auth)/login" style={{ color: colors.primary, fontWeight: '700' }}>Retour à la connexion</Link>
      </Screen>
    );
  }
  return (
    <Screen>
      <H1>Créer un compte</H1>
      <Field label="Prénom ou pseudo" value={displayName} onChangeText={setDisplayName} maxLength={60} />
      <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none"
        keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Mot de passe (8 caractères min.)" value={password} onChangeText={setPassword} secureTextEntry
        autoComplete="new-password" textContentType="newPassword" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <P muted>En créant un compte, vous acceptez les conditions d’utilisation et la charte de la communauté.</P>
      <Button title="S’inscrire" onPress={submit} loading={busy} />
      <Link href="/(auth)/login" style={{ color: colors.primary, textAlign: 'center' }}>J’ai déjà un compte</Link>
    </Screen>
  );
}
