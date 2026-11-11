import { ROLE_ADMINISTRADOR } from '../shared/constants/index.js';
import type { User } from '../users/entities/user.entity.js';

/**
 * Permisos especiales sobre hallazgos por correo. Las listas solo viven en
 * la API: al UI le llegan los permisos del usuario en sesión ya calculados
 * (evidencePermissionsFor), nunca los correos de los demás. Antes
 * GET /evidences/permissions/config mandaba ambas listas a cualquier sesión.
 */

/** Actúan como supervisores en cualquier hallazgo (iniciar, cerrar y reasignar). */
export const SUPERVISOR_OVERRIDE_EMAILS: readonly string[] = [
  'sst@hadamexico.com',
  'klarios@hadamexico.com',
  'gsalgado@hadamexico.com',
  'auxsistemadegestion@hadainternational.com',
  'glora@hadainternational.com',
  'mruiz@hadamexico.com',
  'arodriguez@hadamexico.com',
  'esanchez@hadamexico.com',
  'cseguridad@hadainternational.com',
  'gsanchez@hadamexico.com',
  'bproyectos@hadamexico.com',
  'eduardo-266@hotmail.com',
  'carrellin@hadamexico.com',
  'mfaneite@hadamexico.com',
  'esolorio@hadamexico.com',
];

/** Pueden cancelar hallazgos sin ser administradores. */
export const CANCEL_EVIDENCE_EMAILS: readonly string[] = [
  'glora@hadainternational.com',
  'sst@hadamexico.com',
  'dtrujillo@hadamexico.com',
  'gsanchez@hadamexico.com',
  'cseguridad@hadainternational.com',
  'eduardo-266@hotmail.com',
];

export const hasSupervisorOverride = (user: Pick<User, 'email'>): boolean =>
  SUPERVISOR_OVERRIDE_EMAILS.includes(user.email);

/** Administrador o correo de la lista de cancelación. */
export const canCancelEvidences = (
  user: Pick<User, 'email' | 'role'>,
): boolean =>
  user.role === ROLE_ADMINISTRADOR ||
  CANCEL_EVIDENCE_EMAILS.includes(user.email);

export interface EvidencePermissions {
  /** Actúa como supervisor en cualquier hallazgo. */
  supervisorOverride: boolean;
  /** Puede cancelar hallazgos (administrador o lista de cancelación). */
  cancelEvidence: boolean;
}

/** Lo que el UI necesita para mostrar las acciones (la API valida cada una). */
export const evidencePermissionsFor = (
  user: Pick<User, 'email' | 'role'>,
): EvidencePermissions => ({
  supervisorOverride: hasSupervisorOverride(user),
  cancelEvidence: canCancelEvidences(user),
});
