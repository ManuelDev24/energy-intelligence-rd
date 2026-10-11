import { useState } from 'react';
import { AUTH_ENABLED } from '../../config';
import { AccountSummary } from '../auth/AccountSummary';
import { AcceptInvitationSection } from './AcceptInvitationSection';
import { AccountOnboardingScreen } from './AccountOnboardingScreen';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useHomes } from '../../api/hooks';
import type { Home } from '../../api/types';
import { Button, EmptyView, ErrorView, Loading } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';

export function HomeList({ onPicked }: { onPicked?: (home: Home) => void }) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useHomes();
  const selected = useSession((st) => st.selectedHomeId);
  const selectHome = useSession((st) => st.selectHome);

  if (isLoading) return <Loading label="Cargando viviendas…" />;
  if (isError) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!data || data.length === 0)
    return (
      <EmptyView
        title="No hay viviendas"
        hint={AUTH_ENABLED ? 'Su cuenta no tiene viviendas. Pulse Crear vivienda para empezar con sus propios datos.' : 'Ejecute el seed de la API (python -m app.seed) para cargar las 5 viviendas piloto.'}
        action={<Button title="Actualizar" variant="secondary" onPress={() => void refetch()} />}
      />
    );

  return (
    <FlatList
      data={data}
      keyExtractor={(h) => h.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      renderItem={({ item }) => {
        const active = item.id === selected;
        return (
          <Pressable
            testID={`home-${item.code ?? item.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              selectHome(item.id);
              onPicked?.(item);
            }}
            style={[s.card, active && s.cardActive]}
          >
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.meta}>
              {item.distributor}
              {item.city ? ` · ${item.city}` : ''}
              {item.code ? ` · ${item.code}` : ''}
            </Text>
            {active ? <Text style={s.active}>Vivienda activa</Text> : null}
          </Pressable>
        );
      }}
    />
  );
}

export function HomesScreen({ onPicked }: { onPicked?: (home: Home) => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <View style={s.screen}>
      {AUTH_ENABLED ? <AccountSummary /> : null}
      {creating ? <AccountOnboardingScreen onCancel={() => setCreating(false)} onDone={(home) => { setCreating(false); onPicked?.(home); }} /> : <>
        {AUTH_ENABLED ? <View style={{ paddingHorizontal: spacing.lg }}><Button title="Crear vivienda" testID="auth-add-home" onPress={() => setCreating(true)} /></View> : null}
        {AUTH_ENABLED ? <View style={{ marginTop: spacing.md }}><AcceptInvitationSection onAccepted={onPicked} /></View> : null}
        <HomeList onPicked={onPicked} />
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  cardActive: { borderColor: colors.primary, borderWidth: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  active: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.primary },
});
