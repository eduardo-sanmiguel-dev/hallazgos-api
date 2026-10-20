import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { ROLE_ADMINISTRADOR } from '@shared/constants';
import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  const service = new RequestContextService();

  it('expone la petición dentro del contexto, también tras await', async () => {
    const req = { user: { id: 7 } } as unknown as Request;

    await new Promise<void>((resolve, reject) => {
      RequestContextService.run(req, () => {
        expect(service.request).toBe(req);
        new Promise((r) => setTimeout(r, 5))
          .then(() => expect(service.request['user']).toEqual({ id: 7 }))
          .then(() => resolve(), reject);
      });
    });
  });

  it('aísla peticiones concurrentes', async () => {
    const seen: number[] = [];

    await Promise.all(
      [1, 2].map(
        (id) =>
          new Promise<void>((resolve, reject) => {
            RequestContextService.run(
              { user: { id } } as unknown as Request,
              () => {
                new Promise((r) => setTimeout(r, id === 1 ? 10 : 1))
                  .then(() => seen.push(service.request['user'].id))
                  .then(() => resolve(), reject);
              },
            );
          }),
      ),
    );

    expect(seen.sort()).toEqual([1, 2]);
  });

  it('falla con un mensaje claro fuera de una petición', () => {
    expect(() => service.request).toThrow(/No hay una petición activa/);
  });

  describe('usuario en sesión', () => {
    const within = (user: unknown, assert: () => void) =>
      RequestContextService.run({ user } as unknown as Request, assert);

    it('expone usuario, id, rol y plantas', () => {
      within(
        {
          id: 5,
          role: ROLE_ADMINISTRADOR,
          manufacturingPlants: [{ id: 1 }, { id: 3 }],
        },
        () => {
          expect(service.user.id).toBe(5);
          expect(service.userId).toBe(5);
          expect(service.isAdmin).toBe(true);
          expect(service.manufacturingPlantIds).toEqual([1, 3]);
        },
      );
    });

    it('isAdmin es false para otros roles y plantas vacías si no tiene', () => {
      within({ id: 6, role: 'Supervisor' }, () => {
        expect(service.isAdmin).toBe(false);
        expect(service.manufacturingPlantIds).toEqual([]);
      });
    });

    it('sin sesión: userOrNull es null y user responde 401', () => {
      within(undefined, () => {
        expect(service.userOrNull).toBeNull();
        expect(() => service.user).toThrow(UnauthorizedException);
      });
    });
  });
});
