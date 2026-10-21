import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import {
  buildAdmin,
  buildSupervisor,
  buildUser,
} from '../../../test/utils/index.js';

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  const context = (user?: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as ExecutionContext;
  it('permite al administrador', () =>
    expect(guard.canActivate(context(buildAdmin()))).toBe(true));
  it.each([buildUser(), buildSupervisor()])(
    'rechaza otro rol antes de acceder al servicio',
    (user) => {
      expect(() => guard.canActivate(context(user))).toThrow(
        ForbiddenException,
      );
    },
  );
  it('rechaza una petición sin sesión', () =>
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException));
});
