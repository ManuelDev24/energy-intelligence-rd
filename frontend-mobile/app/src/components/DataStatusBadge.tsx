import { QUALITY, shouldLabel, type Quality } from '@energyrd/core';
import { StyleSheet, Text, View } from 'react-native';

import { radius } from '../theme';

/**
 * Etiqueta de calidad del dato (DataStatusBadge del plan): misma etiqueta y color que la web.
 * INFERIDO lleva borde punteado para distinguirse de ESTIMADO sin depender solo del color.
 */
export function DataStatusBadge({ quality, testID }: { quality: Quality; testID?: string }) {
  const q = QUALITY[quality];
  const inferred = quality === 'INFERRED';
  return (
    <View
      style={[s.badge, { backgroundColor: q.bg }, inferred && [s.dashed, { borderColor: q.fg }]]}
      testID={testID ?? `badge-${quality}`}
      accessible
      accessibilityLabel={`${q.label.toLowerCase()}: ${q.description}`}
    >
      <Text style={[s.text, { color: q.fg }]} maxFontSizeMultiplier={1.4}>
        {q.label}
      </Text>
    </View>
  );
}

/**
 * Lo REAL no se etiqueta salvo `always` (p. ej. en la leyenda): así ESTIMADO/PROYECTADO/INFERIDO
 * destacan donde importan.
 */
export function QualityBadge({ quality, always = false }: { quality: Quality; always?: boolean }) {
  if (!always && !shouldLabel(quality)) return null;
  return <DataStatusBadge quality={quality} />;
}

const s = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  dashed: { borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 7, paddingVertical: 1 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
});
