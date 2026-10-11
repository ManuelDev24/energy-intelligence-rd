// ERD-UI-KIT (móvil): comprobaciones de estructura de los componentes (no hay render de React Native en vitest).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('BillCard: nombres accesibles con el período y eliminar solo en facturas manuales', () => {
  const card = read('./BillCard.tsx');
  expect(card).toContain("bill.source === 'manual'");
  expect(card).toContain('accessibilityLabel={`Ver detalle de la factura de ${period}`}');
  expect(card).toContain('accessibilityLabel={`Eliminar la factura de ${period}`}');
  expect(card).toContain('accessibilityLabel="Factura de demostración"');
  const screen = read('../features/bills/BillsScreen.tsx');
  expect(screen).toContain('<BillCard');
  expect(screen).not.toContain('style={s.demo}');
});
it('RecommendationCard no pinta nada sin texto de la API y se usa en el panel', () => {
  expect(read('./RecommendationCard.tsx')).toContain('if (!text) return null;');
  const dashboard = read('../features/dashboard/DashboardScreen.tsx');
  expect(dashboard).toContain('<RecommendationCard text={recommendation} />');
  expect(dashboard).not.toContain('<Card title="Recomendación"');
});
it('BottomSheet aísla el fondo para el lector de pantalla, se cierra con «atrás» y siempre tiene botón Cerrar', () => {
  const sheet = read('./BottomSheet.tsx');
  expect(sheet).toContain('accessibilityViewIsModal');
  expect(sheet).toContain('onRequestClose');
  expect(sheet).toContain('title="Cerrar"');
  expect(sheet).toContain('dismissible');
  expect(sheet).toContain('keyboardShouldPersistTaps="handled"');
});
it('DateRangePicker usa las reglas compartidas, la hoja inferior y expone el estado a la accesibilidad', () => {
  const picker = read('./DateRangePicker.tsx');
  expect(picker).toContain("from '@energyrd/core'");
  expect(picker).toContain('<BottomSheet');
  expect(picker).toContain('customRangeError');
  expect(picker).toContain('accessibilityRole="radio"');
  expect(picker).toContain('accessibilityState={{ selected');
  expect(read('./dateRangeModel.ts')).toContain("from '@energyrd/core'");
});
it('el rango de Consumo ya no duplica la aritmética de @energyrd/core', () => {
  const range = read('../features/consumption/range.ts');
  expect(range).toContain("from '@energyrd/core'");
  expect(range).not.toContain('86400_000');
  expect(range).not.toContain('addDays(');
});
