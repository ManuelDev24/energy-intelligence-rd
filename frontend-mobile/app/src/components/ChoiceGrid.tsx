import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, TOUCH } from '../theme';

export interface Choice<K extends string> {
  key: K;
  label: string;
  /** Nombre de Ionicons opcional. */
  icon?: string;
}

/**
 * Selector de una opción entre muchas, en filas que se envuelven (para listas largas que no caben en `Segmented`).
 * Cada opción mide 44 pt como mínimo, es un `radio` con estado y su nombre accesible incluye el de la lista; la activa se
 * distingue por fondo, borde y peso del texto, no solo por color. `showLabel={false}` deja solo el icono (el nombre sigue
 * disponible para el lector de pantalla).
 */
export function ChoiceGrid<K extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
  showLabel = true,
}: {
  label: string;
  options: readonly Choice<K>[];
  value: K;
  onChange: (key: K) => void;
  testIDPrefix: string;
  showLabel?: boolean;
}) {
  return (
    <View style={s.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={`${label}: ${o.label}`}
            testID={`${testIDPrefix}-${o.key || 'default'}`}
            style={({ pressed }) => [s.item, !showLabel && s.iconOnly, selected && s.itemOn, pressed && !selected && { opacity: 0.7 }]}
          >
            {o.icon ? (
              <Ionicons name={o.icon as never} size={18} color={selected ? colors.brandDark : colors.muted} accessible={false} />
            ) : null}
            {showLabel ? (
              <Text style={[s.text, selected && s.textOn]} numberOfLines={1}>
                {o.label}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: {
    minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  iconOnly: { minWidth: TOUCH, justifyContent: 'center', paddingHorizontal: 0 },
  itemOn: { backgroundColor: colors.brandSoft, borderColor: colors.primary },
  text: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  textOn: { color: colors.brandDark, fontWeight: '700' },
});
