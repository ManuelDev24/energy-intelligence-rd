import { SEVERITY, type AlertTone } from '@energyrd/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, TOUCH } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** El icono repite la severidad: el color nunca es la única señal. */
const TONE_ICON: Record<AlertTone, IconName> = {
  critical: 'alert-circle',
  warning: 'warning',
  info: 'information-circle',
  savings: 'leaf',
};

/**
 * Tarjeta de alerta con 4 tonos (🔴 crítica · 🟠 advertencia · 🟡 información · 🟢 ahorro).
 * Con `onPress` toda la tarjeta es un botón (resumen del dashboard); con `actions` las acciones
 * quedan como botones propios dentro de la tarjeta (lista de alertas).
 */
export function AlertCard({
  tone,
  title,
  message,
  meta,
  trailing,
  highlighted = true,
  onPress,
  accessibilityHint,
  actions,
  testID,
}: {
  tone: AlertTone;
  /** Por defecto la etiqueta de la severidad ("Alerta crítica"). */
  title?: string;
  message: string;
  meta?: string;
  /** Dato a la derecha del título (p. ej. "+50.00%"). */
  trailing?: string;
  /** Fondo tintado (alerta nueva); si es false, fondo de tarjeta con borde de color. */
  highlighted?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  actions?: ReactNode;
  testID?: string;
}) {
  const sev = SEVERITY[tone];
  const heading = title ?? sev.label;
  const body = (
    <>
      <Ionicons
        name={TONE_ICON[tone]}
        size={20}
        color={sev.fg}
        style={s.icon}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
      <View style={s.content}>
        <View style={s.head}>
          <Text style={[s.title, { color: sev.fg }]}>{heading}</Text>
          {trailing ? <Text style={s.trailing}>{trailing}</Text> : null}
        </View>
        <Text style={s.message}>{message}</Text>
        {meta ? <Text style={s.meta}>{meta}</Text> : null}
        {actions ? <View style={s.actions}>{actions}</View> : null}
      </View>
    </>
  );
  const surface = [
    s.card,
    { borderColor: highlighted ? sev.border : colors.border, borderLeftColor: sev.fg },
    { backgroundColor: highlighted ? sev.bg : colors.card },
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${heading}${trailing ? `, ${trailing}` : ''}: ${message}`}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={({ pressed }) => [...surface, pressed && { opacity: 0.85 }]}
      >
        {body}
        <Ionicons name="chevron-forward" size={18} color={sev.fg} style={s.chevron} importantForAccessibility="no" />
      </Pressable>
    );
  }
  return (
    <View style={surface} testID={testID} accessibilityRole="summary">
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    minHeight: TOUCH,
  },
  icon: { marginTop: 1 },
  chevron: { alignSelf: 'center' },
  content: { flex: 1, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontWeight: '700', fontSize: 14, flexShrink: 1 },
  trailing: { fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  message: { color: colors.text, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg },
});
