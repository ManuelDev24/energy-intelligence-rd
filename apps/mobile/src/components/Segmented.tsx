import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, TOUCH } from '../theme';

/**
 * Selector segmentado (una opción activa). Cada opción es un botón de 44 pt con estado `selected`
 * para lectores de pantalla; la activa se distingue por fondo, borde y peso del texto, no solo color.
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={s.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={`${label}: ${o.label}`}
            testID={`${testIDPrefix}-${o.key}`}
            style={({ pressed }) => [s.item, selected && s.itemOn, pressed && !selected && { opacity: 0.7 }]}
          >
            <Text style={[s.text, selected && s.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  group: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 2, gap: 2 },
  item: { flex: 1, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 2, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 6 },
  itemOn: { backgroundColor: colors.brandSoft, borderColor: colors.primary },
  text: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  textOn: { color: colors.brandDark, fontWeight: '700' },
});
