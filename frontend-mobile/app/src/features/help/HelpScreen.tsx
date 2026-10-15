// ERD-HELP-01-MOBILE: centro de ayuda — búsqueda con retraso, categorías, artículos desplegables y contacto honesto.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useHelp, useHelpArticle } from '../../api/hooks';
import { TextAction } from '../../components/Button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { colors, radius, spacing, TOUCH } from '../../theme';
import { effectiveQuery, HELP_DEBOUNCE_MS, resultsLabel, supportMailto } from './model';

function Article({ id, title, summary }: { id: string; title: string; summary: string }) {
  const [open, setOpen] = useState(false);
  const article = useHelpArticle(id, open);
  return (
    <View style={s.card} testID={`help-article-${id}`}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${open ? 'Ocultar' : 'Ver'} respuesta`} accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)} style={s.head} testID={`help-toggle-${id}`}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.muted}>{summary}</Text>
      </Pressable>
      {open ? (article.isLoading ? <Text style={s.muted}>Cargando…</Text> : article.isError ? <ErrorState error={article.error} onRetry={() => void article.refetch()} />
        : <View style={{ gap: spacing.sm }}>{article.data?.body.map((p) => <Text key={p} style={s.body}>{p}</Text>)}</View>) : null}
    </View>
  );
}

export function HelpScreen() {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(effectiveQuery(text)), HELP_DEBOUNCE_MS); return () => clearTimeout(t); }, [text]);
  const { data, isLoading, isError, error, refetch } = useHelp(debounced, category);
  const mailto = supportMailto(data?.contact.email ?? null);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={s.muted}>Respuestas a las dudas más comunes sobre facturas, datos, ahorro y tu cuenta.</Text>
        <TextInput value={text} onChangeText={setText} maxLength={80} accessibilityLabel="Buscar en la ayuda" placeholder="Por ejemplo: contraseña, factura, estimado"
          placeholderTextColor={colors.muted} returnKeyType="search" autoCorrect={false} style={s.input} testID="help-search" />
        {isLoading ? <LoadingSkeleton label="Cargando la ayuda…" count={3} /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : data ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Categorías" contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
              {[{ id: null as string | null, label: 'Todas' }, ...data.categories].map((c) => (
                <Pressable key={c.id ?? 'all'} accessibilityRole="radio" accessibilityLabel={`Categoría: ${c.label}`} accessibilityState={{ selected: category === c.id, checked: category === c.id }}
                  onPress={() => setCategory(c.id)} style={[s.chip, category === c.id && s.chipOn]} testID={`help-cat-${c.id ?? 'all'}`}>
                  <Text style={[s.chipText, category === c.id && { color: colors.brandDark, fontWeight: '700' }]}>{c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={s.muted} accessibilityLiveRegion="polite" testID="help-count">{resultsLabel(data.articles.length, debounced)}</Text>
            {data.articles.length ? data.articles.map((a) => <Article key={a.id} id={a.id} title={a.title} summary={a.summary} />)
              : <EmptyState icon="help-circle-outline" title="No encontramos nada" hint="Prueba con otra palabra o escribe a soporte." compact />}
            <View style={s.card} testID="help-contact">
              <Text style={s.title} accessibilityRole="header">¿No encontraste la respuesta?</Text>
              <Text style={s.muted}>{data.contact.note}</Text>
              {mailto ? <TextAction title={data.contact.email as string} onPress={() => { void Linking.openURL(mailto).catch(() => undefined); }} testID="help-mail" accessibilityLabel={`Escribir a ${data.contact.email}`} /> : null}
              <Text style={s.muted}>Contenido de ayuda versión {data.content_version}.</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  input: { minHeight: TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.text, fontSize: 16, backgroundColor: colors.card },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  head: { minHeight: TOUCH, gap: 4 },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.brandSoft },
  chipText: { color: colors.muted, fontSize: 14 },
});
