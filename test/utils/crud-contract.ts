import type { User } from 'users/entities/user.entity';

import { Type } from '@nestjs/common';

import { buildUser } from './factories';
import { createHttpTestApp, HttpTestApp } from './http-app';
import { mockProvider } from './testing-module';

type Cases = [string, Record<string, unknown>][];

interface CrudContract {
  user?: User;
  /** Ruta base del controlador, p. ej. '/gemba-walk/zones'. */
  path: string;
  controller: Type<unknown>;
  service: Type<unknown>;
  /** POST: cuerpo válido y cuerpos que deben responder 400. */
  create?: {
    valid: Record<string, unknown>;
    /** Lo que debe recibir el servicio (por defecto, `valid`). */
    expected?: Record<string, unknown>;
    invalid?: Cases;
    method?: string;
  };
  /** GET: filtros válidos (como llegan ya convertidos) e inválidos. */
  list?: {
    query?: Record<string, unknown>;
    expected?: Record<string, unknown>;
    invalid?: Cases;
    method?: string;
  };
  findOne?: { method?: string } | true;
  /** PATCH /:id: cuerpo válido e inválidos. */
  update?: { valid: Record<string, unknown>; invalid?: Cases; method?: string };
  remove?: { method?: string } | true;
}

/** Declara un caso por elemento; sin elementos no declara nada. */
const eachCase =
  (cases?: Cases) =>
  (
    name: string,
    fn: (label: string, body: Record<string, unknown>) => Promise<void>,
  ) => {
    if (cases?.length) it.each(cases)(name, fn);
  };

const methodOf = (option: { method?: string } | true, fallback: string) =>
  option === true ? fallback : (option.method ?? fallback);

/**
 * Contrato HTTP de un controlador CRUD: rutas, validación de DTOs (400 sin
 * llegar al servicio), ids convertidos a número y delegación al servicio.
 * Solo prueba el controlador; la lógica se prueba en el spec del servicio.
 */
export const describeCrudContract = (contract: CrudContract) => {
  describe(`${contract.controller.name} (HTTP ${contract.path})`, () => {
    let http: HttpTestApp;
    let service: Record<string, jest.Mock>;

    beforeAll(async () => {
      http = await createHttpTestApp({
        controllers: [contract.controller],
        providers: [mockProvider(contract.service)],
        user: contract.user ?? buildUser({ id: 10 }),
      });
      service = http.get(contract.service) as unknown as Record<
        string,
        jest.Mock
      >;
    });

    afterAll(() => http.close());

    beforeEach(() => {
      jest.clearAllMocks();
      for (const fn of Object.values(service))
        fn.mockResolvedValue({ ok: true });
    });

    const { create, list, findOne, update, remove, path } = contract;

    if (create) {
      const method = create.method ?? 'create';

      it(`POST ${path} crea con el cuerpo validado`, async () => {
        await http.http().post(path).send(create.valid).expect(201);

        expect(service[method]).toHaveBeenCalledWith(
          expect.objectContaining(create.expected ?? create.valid),
        );
      });

      eachCase(create.invalid)(
        `POST ${path} responde 400 %s`,
        async (_c, body) => {
          await http.http().post(path).send(body).expect(400);

          expect(service[method]).not.toHaveBeenCalled();
        },
      );
    }

    if (list) {
      const method = list.method ?? 'findAll';

      it(`GET ${path} pasa los filtros convertidos`, async () => {
        await http
          .http()
          .get(path)
          .query(list.query ?? {})
          .expect(200);

        expect(service[method]).toHaveBeenCalledWith(
          expect.objectContaining(list.expected ?? list.query ?? {}),
        );
      });

      eachCase(list.invalid)(
        `GET ${path} responde 400 %s`,
        async (_c, query) => {
          await http.http().get(path).query(query).expect(400);

          expect(service[method]).not.toHaveBeenCalled();
        },
      );
    }

    if (findOne) {
      const method = methodOf(findOne, 'findOne');

      it(`GET ${path}/:id consulta con el id numérico`, async () => {
        await http.http().get(`${path}/12`).expect(200, { ok: true });

        expect(service[method]).toHaveBeenCalledWith(12);
      });
    }

    if (update) {
      const method = update.method ?? 'update';

      it(`PATCH ${path}/:id actualiza con el id numérico`, async () => {
        await http.http().patch(`${path}/12`).send(update.valid).expect(200);

        expect(service[method]).toHaveBeenCalledWith(
          12,
          expect.objectContaining(update.valid),
        );
      });

      eachCase(update.invalid)(
        `PATCH ${path}/:id responde 400 %s`,
        async (_c, body) => {
          await http.http().patch(`${path}/12`).send(body).expect(400);

          expect(service[method]).not.toHaveBeenCalled();
        },
      );
    }

    if (remove) {
      const method = methodOf(remove, 'remove');

      it(`DELETE ${path}/:id elimina con el id numérico`, async () => {
        await http.http().delete(`${path}/12`).expect(200);

        expect(service[method]).toHaveBeenCalledWith(12);
      });
    }
  });
};
