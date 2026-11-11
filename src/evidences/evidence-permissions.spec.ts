import {
  ROLE_ADMINISTRADOR,
  ROLE_GENERAL,
  ROLE_SUPERVISOR,
} from '../shared/constants/index.js';
import {
  CANCEL_EVIDENCE_EMAILS,
  SUPERVISOR_OVERRIDE_EMAILS,
  canCancelEvidences,
  evidencePermissionsFor,
  hasSupervisorOverride,
} from './evidence-permissions.js';

describe('evidence-permissions', () => {
  it('correo en la lista de supervisores especiales', () => {
    expect(hasSupervisorOverride({ email: 'klarios@hadamexico.com' })).toBe(
      true,
    );
    expect(hasSupervisorOverride({ email: 'ana@hallazgos.test' })).toBe(false);
  });

  it('cancelan los administradores y los correos de la lista de cancelación', () => {
    expect(
      canCancelEvidences({ email: 'x@test', role: ROLE_ADMINISTRADOR }),
    ).toBe(true);
    expect(
      canCancelEvidences({
        email: 'dtrujillo@hadamexico.com',
        role: ROLE_SUPERVISOR,
      }),
    ).toBe(true);
    // Supervisor especial no implica cancelar.
    expect(
      canCancelEvidences({
        email: 'klarios@hadamexico.com',
        role: ROLE_SUPERVISOR,
      }),
    ).toBe(false);
  });

  it('evidencePermissionsFor resume ambos permisos en booleanos', () => {
    expect(
      evidencePermissionsFor({
        email: 'sst@hadamexico.com',
        role: ROLE_SUPERVISOR,
      }),
    ).toEqual({ supervisorOverride: true, cancelEvidence: true });
    expect(
      evidencePermissionsFor({
        email: 'ana@hallazgos.test',
        role: ROLE_GENERAL,
      }),
    ).toEqual({ supervisorOverride: false, cancelEvidence: false });
  });

  it('mismo criterio que antes: el correo debe coincidir exacto', () => {
    expect(hasSupervisorOverride({ email: 'KLARIOS@hadamexico.com' })).toBe(
      false,
    );
  });

  it('las listas no cambian al moverlas desde EvidencesService', () => {
    expect(SUPERVISOR_OVERRIDE_EMAILS).toHaveLength(15);
    expect(CANCEL_EVIDENCE_EMAILS).toHaveLength(6);
  });
});
