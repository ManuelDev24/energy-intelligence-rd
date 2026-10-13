import { StyleSheet, Text, View } from 'react-native';

import type { Bill } from '../api/types';
import { fmtDop, fmtKwh, fmtPeriod } from '../lib/format';
import { billOpenTestID } from '../features/bills/detail/screenState';
import { colors, radius, spacing } from '../theme';
import { TextAction } from './Button';

/**
 * ERD-UI-KIT: factura en una lista. Solo datos de la factura. «Ver detalle» y «Eliminar» aparecen si se pasan los
 * manejadores; eliminar solo para facturas manuales (las de demostración no se tocan). Nombres accesibles con el período.
 */
export function BillCard({ bill, onOpen, onDelete }: { bill: Bill; onOpen?: () => void; onDelete?: () => void }) {
  const period = fmtPeriod(bill.period_start, bill.period_end);
  return (
    <View style={s.card} testID={`bill-${bill.period_start}`}>
      <View style={s.row}>
        <Text style={s.period}>{period}</Text>
        {bill.source === 'seed' ? (
          <Text style={s.demo} accessibilityLabel="Factura de demostración">
            DEMO
          </Text>
        ) : null}
      </View>
      <Text style={s.main}>
        {fmtKwh(bill.kwh)} · {fmtDop(bill.amount_dop)}
      </Text>
      <View style={s.row}>
        <Text style={s.meta}>{bill.days} días</Text>
        <View style={s.actions}>
          {onOpen ? (
            <TextAction title="Ver detalle" onPress={onOpen} testID={billOpenTestID(bill.period_start)} accessibilityLabel={`Ver detalle de la factura de ${period}`} />
          ) : null}
          {onDelete && bill.source === 'manual' ? (
            <TextAction title="Eliminar" tone="danger" onPress={onDelete} accessibilityLabel={`Eliminar la factura de ${period}`} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  period: { fontWeight: '600', color: colors.text },
  main: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { color: colors.muted, fontSize: 13 },
  demo: { fontSize: 10, fontWeight: '700', color: colors.warning, backgroundColor: colors.warningBg, paddingHorizontal: 6, borderRadius: radius.full },
});
