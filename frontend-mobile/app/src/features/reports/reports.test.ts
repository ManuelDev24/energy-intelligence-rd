import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pdfOpenUrl, reportRange } from './model';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
describe('informe energético (móvil)', () => {
  it('los períodos terminan hoy y caben en el límite de 366 días de la API', () => {
    expect(reportRange('year', '2026-10-14')).toEqual({ from: '2026-01-01', to: '2026-10-14' });
    expect(reportRange('6m', '2026-10-14')).toEqual({ from: '2026-04-15', to: '2026-10-14' });
    const twelve = reportRange('12m', '2026-10-14');
    expect(twelve.to).toBe('2026-10-14');
    expect((Date.parse(twelve.to) - Date.parse(twelve.from)) / 86_400_000 + 1).toBeLessThanOrEqual(366);
  });
  it('está en la navegación (desde Perfil), comparte texto sin dependencias nuevas y marca lo estimado', () => {
    const nav = read('../../navigation/AppNavigator.tsx');
    expect(nav).toContain('name="Reports"');
    expect(nav).toContain("onReports={() => navigation.navigate('Reports')}");
    expect(read('../profile/ProfileScreen.tsx')).toContain('testID="profile-reports"');
    const screen = read('./ReportsScreen.tsx');
    expect(screen).toContain('Share.share');
    expect(screen).toContain('energyReportToText(data)');
    expect(screen).toContain("line.quality !== 'REAL'");
    expect(JSON.parse(read('../../../package.json')).dependencies).not.toHaveProperty('expo-print');
  });

  it('el PDF solo se abre desde el enlace firmado del propio servidor', () => {
    const token = 'rpt1.' + 'a'.repeat(30) + '.' + 'b'.repeat(20);
    expect(pdfOpenUrl('https://api.test/', `/api/v1/reports/download?token=${token}`)).toBe(`https://api.test/api/v1/reports/download?token=${token}`);
    for (const bad of ['https://evil.example/x', '/api/v1/documents/download?token=' + token, '/api/v1/reports/download?token=corto', '//evil/api/v1/reports/download?token=' + token, '']) {
      expect(pdfOpenUrl('https://api.test', bad), bad).toBeNull();
    }
    const screen = read('./ReportsScreen.tsx');
    expect(screen).toContain('createEnergyReportPdfLink(homeId, range)');
    expect(screen).toContain('testID="report-pdf"');
  });
});
