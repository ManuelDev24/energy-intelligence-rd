// ERD-RPT-01-MOBILE: informe energético en pantalla y para compartir como texto (sin dependencias nativas nuevas).
// PDF: lo genera la API (reportlab) y se abre con un enlace firmado; «Compartir» envía el texto. Sin dependencias nativas nuevas.
import { energyReportToText, energyReportView, todayRD } from '@energyrd/core';
import { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { api } from '../../api/client';
import { useEnergyReport } from '../../api/hooks';
import { API_URL } from '../../config';
import { Button } from '../../components/Button';
import { QualityBadge } from '../../components/DataStatusBadge';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';
import { pdfOpenUrl, REPORT_PERIODS, reportRange, type ReportPeriodKey } from './model';

export function ReportsScreen() {
  const homeId = useSession((st) => st.selectedHomeId);
  const [period, setPeriod] = useState<ReportPeriodKey>('12m');
  const [shareError, setShareError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const range = reportRange(period, todayRD());
  const { data, isLoading, isError, error, refetch } = useEnergyReport(homeId, range.from, range.to);

  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="El informe usa los datos de la vivienda activa." />;
  const view = data ? energyReportView(data) : null;
  const share = async () => {
    if (!data) return;
    setShareError(false);
    try { await Share.share({ title: 'Informe energético', message: energyReportToText(data) }); } catch { setShareError(true); }
  };

  // El PDF se abre con un enlace firmado de 2 minutos (el visor del teléfono no puede enviar la sesión): lo guarda o comparte desde ahí.
  const openPdf = async () => {
    setPdfBusy(true); setPdfError(false);
    try {
      const link = await api.createEnergyReportPdfLink(homeId, range);
      const url = pdfOpenUrl(API_URL, link.url);
      if (!url) throw new Error('enlace no válido');
      await Linking.openURL(url);
    } catch { setPdfError(true); } finally { setPdfBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen} testID="reports-screen">
      <Text style={s.muted}>Resumen de tu consumo y gasto con la calidad de cada dato. Se basa en tus facturas (mensuales).</Text>
      <Segmented label="Período" options={REPORT_PERIODS.map(({ key, label }) => ({ key, label }))} value={period} onChange={setPeriod} testIDPrefix="report-period" />
      {isLoading ? <LoadingSkeleton label="Preparando el informe…" count={3} /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : view ? (
        <View style={{ gap: spacing.md }} testID="energy-report">
          <Text style={s.title} accessibilityRole="header">{view.title}</Text>
          <Text style={s.muted}>{view.subtitle}</Text>
          {view.sections.map((section) => (
            <View key={section.title} style={s.card} accessible={false}>
              <Text style={s.section} accessibilityRole="header">{section.title}</Text>
              {section.lines.length ? section.lines.map((line, i) => (
                <View key={`${line.label}-${i}`} style={s.line} accessible accessibilityLabel={`${line.label}: ${line.value}${line.quality && line.quality !== 'REAL' ? ', estimado' : ''}`}>
                  <Text style={[s.label, { flex: 1 }]}>{line.label}</Text>
                  <View style={s.valueBox}>
                    <Text style={s.value}>{line.value}</Text>
                    {line.quality && line.quality !== 'REAL' ? <QualityBadge quality={line.quality} always /> : null}
                  </View>
                </View>
              )) : <Text style={s.muted}>{section.empty ?? 'Sin datos.'}</Text>}
            </View>
          ))}
          {view.sources.length ? <View style={{ gap: 2 }}><Text style={s.section} accessibilityRole="header">Fuentes</Text>{view.sources.map((x) => <Text key={x} style={s.muted}>• {x}</Text>)}</View> : null}
          <View style={{ gap: 2 }}><Text style={s.section} accessibilityRole="header">Notas</Text>{view.notes.map((x) => <Text key={x} style={s.muted}>• {x}</Text>)}</View>
          <Text style={s.muted}>{view.generated}</Text>
          {shareError ? <Text style={s.error} accessibilityRole="alert">No se pudo abrir el menú de compartir.</Text> : null}
          {pdfError ? <Text style={s.error} accessibilityRole="alert">No se pudo abrir el PDF. Inténtalo de nuevo.</Text> : null}
          <Button title="Abrir PDF" variant="secondary" loading={pdfBusy} onPress={() => void openPdf()} testID="report-pdf" />
          <Button title="Compartir informe" variant="secondary" onPress={() => void share()} testID="report-share" />
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  section: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  line: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  label: { color: colors.muted, fontSize: 14 },
  valueBox: { alignItems: 'flex-end', gap: 2, maxWidth: '55%' },
  value: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, fontSize: 14 },
});
