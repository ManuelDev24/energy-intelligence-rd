import { canInvestigate, investigationRange } from '@energyrd/core';
import { StyleSheet, Text, View } from 'react-native';

import type { Anomaly } from '../../api/types';
import { AlertCard } from '../../components/AlertCard';
import { Button } from '../../components/Button';
import { formatAnomaly } from '../../lib/anomaly';
import { colors, radius, spacing } from '../../theme';

type Range = { from: string; to: string; granularity: 'day' };

export function AnomaliesSection({ anomalies, onInvestigate, onOpenBill, onDismiss, pendingId }: {
  anomalies: Anomaly[];
  onInvestigate?: (range: Range) => void;
  onOpenBill?: (billId: string) => void;
  onDismiss?: (anomaly: Anomaly) => void;
  pendingId?: string | null;
}) {
  return (
    <View style={styles.section} testID="anomalies-section">
      <Text style={styles.title} accessibilityRole="header">Desviaciones detectadas</Text>
      <Text style={styles.description}>Comparación con su historial de lecturas y facturas; no identifica equipos. La confianza indica cuánto respaldan los datos cada hallazgo.</Text>
      {anomalies.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin desviaciones recientes</Text>
          <Text style={styles.emptyText}>No hay suficiente historial o no se detectaron desviaciones en este período.</Text>
        </View>
      ) : anomalies.map((anomaly) => {
        const view = formatAnomaly(anomaly);
        const actions = [
          onInvestigate && canInvestigate(anomaly)
            ? <Button key="investigate" title="Investigar en Consumo" variant="secondary" accessibilityLabel={`Investigar en Consumo la desviación de ${view.period}`} onPress={() => onInvestigate(investigationRange(anomaly))} />
            : null,
          onOpenBill && anomaly.bill_id
            ? <Button key="bill" title="Ver factura" variant="secondary" accessibilityLabel={`Ver la factura de la desviación de ${view.period}`} onPress={() => onOpenBill(anomaly.bill_id as string)} />
            : null,
          onDismiss
            ? <Button key="dismiss" title="Descartar" variant="secondary" disabled={pendingId === anomaly.id} accessibilityLabel={`Descartar la desviación de ${view.period}`} onPress={() => onDismiss(anomaly)} />
            : null,
        ].filter(Boolean);
        return <AlertCard key={anomaly.id} tone={anomaly.severity} title={view.title} message={`${view.explanation}\n${view.confidenceHelp}`} trailing={view.delta ?? undefined}
          meta={`${view.period} · Observado: ${view.observed} · ${view.baselineLabel}: ${view.baseline} · ${view.confidence}`}
          actions={actions.length ? <View style={styles.actions}>{actions}</View> : undefined} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 13 },
  actions: { gap: spacing.sm },
  empty: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 13 },
});
