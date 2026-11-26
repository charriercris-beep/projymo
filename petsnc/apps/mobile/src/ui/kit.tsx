import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrand } from '@/providers/brand';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const { colors } = useBrand();
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <Body style={{ flex: 1 }} contentContainerStyle={scroll ? [styles.pad, style] : undefined}
        {...(scroll ? { keyboardShouldPersistTaps: 'handled' as const } : {})}>
        {scroll ? children : <View style={[styles.pad, { flex: 1 }, style]}>{children}</View>}
      </Body>
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const { colors } = useBrand();
  return <Text accessibilityRole="header" style={[styles.h1, { color: colors.text }]}>{children}</Text>;
}
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { colors } = useBrand();
  return <Text style={[{ color: muted ? colors.muted : colors.text, fontSize: 15, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Button({ title, onPress, loading, variant = 'primary', disabled }: {
  title: string; onPress: () => void; loading?: boolean; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const { colors } = useBrand();
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading) }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: pressed || disabled ? 0.7 : 1,
        borderColor: variant === 'secondary' ? colors.primary : bg, borderWidth: 1.5 }]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const { colors } = useBrand();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: error ? colors.danger : colors.border, backgroundColor: colors.card, color: colors.text }]}
        {...props} />
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useBrand();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.card }]}>
      <Text style={{ color: selected ? '#fff' : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const { colors } = useBrand();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

export function Empty({ title, text }: { title: string; text: string }) {
  return <Card><H2>{title}</H2><P muted>{text}</P></Card>;
}
export function H2({ children }: { children: ReactNode }) {
  const { colors } = useBrand();
  return <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const { colors } = useBrand();
  return <Text accessibilityRole="alert" style={{ color: colors.danger }}>{children}</Text>;
}

const styles = StyleSheet.create({
  pad: { padding: 20, gap: 14 },
  h1: { fontSize: 28, fontWeight: '800' },
  btn: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
});
