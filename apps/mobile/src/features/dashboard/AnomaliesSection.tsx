import type { Anomaly } from '../../api/types';
import { AlertCard } from '../../components/AlertCard';
import { formatAnomaly } from '../../lib/anomaly';
import { colors, radius, spacing } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';

export function AnomaliesSection({ anomalies }: { anomalies: Anomaly[] }) {
  return (
    <View style={styles.section} testID="anomalies-section">
      <Text style={styles.title} accessibilityRole="header">Desviaciones detectadas</Text>
      <Text style={styles.description}>Comparación con el historial disponible; no identifica equipos ni usa datos horarios.</Text>
      {anomalies.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin desviaciones recientes</Text>
          <Text style={styles.emptyText}>No hay suficiente historial o no se detectaron desviaciones en este período.</Text>
        </View>
      ) : anomalies.map((anomaly) => {
        const view = formatAnomaly(anomaly);
        return <AlertCard key={`${anomaly.period_start}-${anomaly.period_end}-${anomaly.granularity}`} tone={anomaly.severity} title="Consumo fuera de lo habitual" message={view.explanation} trailing={view.delta} meta={`${view.period} · Observado: ${view.observed} · Línea base: ${view.baseline}`} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 13 },
  empty: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 13 },
});
