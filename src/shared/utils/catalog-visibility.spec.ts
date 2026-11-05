import { ForbiddenException } from '@nestjs/common';
import { buildAdmin, buildUser, runAsUser } from '../../../test/utils/index.js';
import { catalogIncludesInactive } from './catalog-visibility.js';

describe('Visibilidad de catálogos', () => {
  it.each([undefined, false, 'false', 'TRUE', '1'])(
    'no incluye inactivos con %s',
    (value) => {
      expect(catalogIncludesInactive(value)).toBe(false);
    },
  );
  it.each([true, 'true'])('permite %s solo al administrador', async (value) => {
    await expect(
      runAsUser(buildAdmin(), () => catalogIncludesInactive(value)),
    ).resolves.toBe(true);
    await expect(
      runAsUser(buildUser(), () => catalogIncludesInactive(value)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
