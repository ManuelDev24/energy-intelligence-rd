import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@energyrd/api-client';
import { sanitizeApiError } from '../../api/errors';
import { claimErrorText } from './model';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
describe('reclamaciones (móvil)', () => {
  it('traduce los errores a texto local sin mostrar el detalle del servidor', () => {
    const limit = sanitizeApiError(new ApiError(409, 'detalle interno', {}, 'claim_limit')) as ApiError;
    expect(limit.code).toBe('claim_limit');                                    // el saneado conserva los códigos conocidos
    expect(claimErrorText(limit, 'create')).toMatch(/demasiadas reclamaciones/);
    expect(claimErrorText(new ApiError(409, 'x', {}, 'claim_conflict'), 'create')).toBe('Ya tienes una reclamación abierta de este tipo para esa factura.');
    expect(claimErrorText(new ApiError(409, 'x'), 'update')).toBe('Este caso ya está cerrado.');
    expect(claimErrorText(new ApiError(404, 'x'))).toMatch(/No se encontró/);
    expect(claimErrorText(new ApiError(0, 'x'))).toMatch(/conectar/);
    expect(claimErrorText(new ApiError(500, 'secreto'), 'create')).not.toMatch(/secreto/);
    expect(claimErrorText(new Error('raro'))).toBe('No se pudo completar la acción. Inténtalo de nuevo.');
  });
  it('está en la navegación (Perfil → Reclamaciones → alta/detalle) y no acusa a nadie', () => {
    const nav = read('../../navigation/AppNavigator.tsx');
    for (const name of ['Claims', 'ClaimForm', 'ClaimDetail']) expect(nav).toContain(`name="${name}"`);
    expect(nav).toContain("onClaims={() => navigation.navigate('Claims')}");
    expect(read('../profile/ProfileScreen.tsx')).toContain('testID="profile-claims"');
    for (const f of ['./ClaimsScreen.tsx', './ClaimFormScreen.tsx', './ClaimDetailScreen.tsx']) {
      const text = read(f);
      expect(text, f).not.toMatch(/error\.message|\.detail|fraude|cobró de más/i);
    }
    expect(read('./ClaimDetailScreen.tsx')).toContain('data.disclaimer');
    expect(read('./ClaimDetailScreen.tsx')).toContain("Alert.alert('Cerrar caso'");
  });
});
