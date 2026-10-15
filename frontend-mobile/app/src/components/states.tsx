import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { describeError } from '../api/errors';
import { colors, radius, spacing, TOUCH } from '../theme';
import { Button } from './Button';

type IconName = keyof typeof Ionicons.glyphMap;

/** Estado vacío con contexto: qué falta y cómo resolverlo (nunca un gráfico vacío). */
export function EmptyState({
  title,
  hint,
  action,
  icon = 'document-text-outline',
  compact = false,
  testID = 'state-empty',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: IconName | null;
  /** Dentro de una tarjeta: sin `flex: 1` ni padding de pantalla. */
  compact?: boolean;
  testID?: string;
}) {
  return (
    <View style={[s.center, compact && s.compact]} testID={testID}>
      {icon ? (
        <Ionicons name={icon} size={compact ? 24 : 32} color={colors.muted} importantForAccessibility="no" accessibilityElementsHidden />
      ) : null}
      <Text style={s.title} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={s.muted}>{hint}</Text> : null}
      {action}
    </View>
  );
}

/** Error de carga con "Reintentar" (botón de 44 pt). Distingue sin conexión de error del servidor.
 *  Solo muestra texto local (`describeError`), nunca el texto que envía el servidor. */
export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { offline, message } = describeError(error);
  return (
    <View style={s.center} testID="state-error" accessibilityRole="alert">
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={32}
        color={colors.danger}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
      <Text style={s.errTitle}>{title ?? (offline ? 'Sin conexión' : 'No se pudo cargar')}</Text>
      <Text style={s.muted}>
        {offline ? 'Revise su conexión a internet o que el servidor esté disponible.' : message}
      </Text>
      {offline ? <Text style={s.detail}>{message}</Text> : null}
      {onRetry && <Button title="Reintentar" onPress={onRetry} testID="retry" />}
    </View>
  );
}

/** Lee la preferencia del sistema "Reducir movimiento" y la sigue si cambia. */
function useReduceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Bloque gris con pulso de opacidad (hilo nativo). Sin pulso si el usuario reduce el movimiento. */
export function SkeletonBlock({ height = 14, width = '100%', style }: { height?: number; width?: DimensionValue; style?: object }) {
  const reduced = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, opacity]);
  return <Animated.View style={[s.block, { height, width, opacity }, style]} />;
}

/**
 * Esqueleto de pantalla: imita la forma de lo que va a cargar (cabecera + tarjetas) para que la
 * pantalla no salte al llegar los datos. Expuesto a lectores de pantalla como "Cargando…".
 */
export function LoadingSkeleton({
  label = 'Cargando…',
  variant = 'cards',
  count = 3,
}: {
  label?: string;
  /** `dashboard`: tarjeta de marca + gráfico; `cards`: lista de tarjetas. */
  variant?: 'dashboard' | 'cards';
  count?: number;
}) {
  return (
    <View
      style={s.skeleton}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID="state-loading"
    >
      {variant === 'dashboard' ? (
        <>
          <SkeletonBlock height={22} width="55%" />
          <SkeletonBlock height={132} style={{ borderRadius: radius.lg }} />
          <SkeletonBlock height={180} style={{ borderRadius: radius.md }} />
        </>
      ) : null}
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.cardSkel}>
          <SkeletonBlock height={14} width="45%" />
          <SkeletonBlock height={18} width="70%" />
          <SkeletonBlock height={12} width="30%" />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  compact: { flex: 0, padding: spacing.md },
  muted: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  detail: { color: colors.muted, textAlign: 'center', fontSize: 12 },
  title: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  errTitle: { color: colors.danger, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  skeleton: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  block: { backgroundColor: colors.skeleton, borderRadius: radius.sm },
  cardSkel: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    minHeight: TOUCH * 2,
  },
});
