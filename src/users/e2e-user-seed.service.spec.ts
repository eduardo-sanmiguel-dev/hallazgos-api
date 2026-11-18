import * as argon2 from 'argon2';
import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import {
  createRepositoryMock,
  type RepositoryMock,
} from '../../test/utils/index.js';
import { ROLE_ADMINISTRADOR, ROLE_GENERAL } from '../shared/constants/index.js';
import type { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import type { User } from './entities/user.entity.js';
import { E2E_USER_NAME, E2eUserSeedService } from './e2e-user-seed.service.js';

const EMAIL = 'e2e@hallazgos.test';
const PASSWORD = 'una-contrasena-de-prueba-larga';
const PLANTS = [{ id: 1 }, { id: 2 }] as ManufacturingPlant[];

describe('E2eUserSeedService', () => {
  let users: RepositoryMock<User>;
  let plants: RepositoryMock<ManufacturingPlant>;
  let env: Record<string, string | undefined>;

  const service = () =>
    new E2eUserSeedService(
      { get: (key: string) => env[key] } as unknown as ConfigService,
      users,
      plants,
    );

  beforeEach(() => {
    users = createRepositoryMock<User>();
    plants = createRepositoryMock<ManufacturingPlant>();
    plants.find.mockResolvedValue(PLANTS);
    env = {
      environment: 'development',
      'db.host': '127.0.0.1',
      E2E_EMAIL: EMAIL,
      E2E_PASSWORD: PASSWORD,
    };
  });

  it.each([
    ['producción', { environment: 'production' }],
    ['pruebas', { environment: 'test' }],
    ['base remota', { 'db.host': '82.197.95.145' }],
    ['sin host de base configurado', { 'db.host': undefined }],
    ['sin credenciales', { E2E_EMAIL: undefined, E2E_PASSWORD: undefined }],
    ['correo que no es de pruebas', { E2E_EMAIL: 'admin@hadamexico.com' }],
    ['contraseña corta', { E2E_PASSWORD: 'corta' }],
  ])('no hace nada en %s', async (_, overrides) => {
    Object.assign(env, overrides);

    await expect(service().ensureE2eUser()).resolves.toBe('skipped');
    expect(users.findOne).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  });

  it('crea el usuario si no existe (Administrador, todas las plantas)', async () => {
    await expect(service().ensureE2eUser()).resolves.toBe('created');

    expect(users.save).toHaveBeenCalledWith({
      name: E2E_USER_NAME,
      email: EMAIL,
      // Se cifra en el @BeforeInsert de la entidad.
      password: PASSWORD,
      role: ROLE_ADMINISTRADOR,
      isActive: true,
      manufacturingPlants: PLANTS,
    });
  });

  it('si ya está correcto no lo modifica', async () => {
    users.findOne.mockResolvedValue({
      id: 9,
      password: await argon2.hash(PASSWORD),
      role: ROLE_ADMINISTRADOR,
      isActive: true,
      manufacturingPlants: PLANTS,
    } as User);

    await expect(service().ensureE2eUser()).resolves.toBe('ok');
    expect(users.save).not.toHaveBeenCalled();
  });

  it('corrige contraseña, rol, estado y plantas si cambiaron', async () => {
    users.findOne.mockResolvedValue({
      id: 9,
      password: await argon2.hash('otra-contrasena-anterior'),
      role: ROLE_GENERAL,
      isActive: false,
      manufacturingPlants: [PLANTS[0]],
    } as User);

    await expect(service().ensureE2eUser()).resolves.toBe('updated');

    const saved = users.save.mock.calls[0][0] as User;
    expect(await argon2.verify(saved.password, PASSWORD)).toBe(true);
    expect(saved).toMatchObject({
      role: ROLE_ADMINISTRADOR,
      isActive: true,
      manufacturingPlants: PLANTS,
    });
  });

  it('al arrancar, un error de la base solo se registra (la API sigue)', async () => {
    users.findOne.mockRejectedValue(new Error('sin conexión'));

    await expect(service().onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('una contraseña guardada que no es un hash válido se reemplaza', async () => {
    users.findOne.mockResolvedValue({
      id: 9,
      password: 'no-es-un-hash',
      role: ROLE_ADMINISTRADOR,
      isActive: true,
      manufacturingPlants: PLANTS,
    } as User);

    await expect(service().ensureE2eUser()).resolves.toBe('updated');
    await expect(
      argon2.verify(users.save.mock.calls[0][0].password, PASSWORD),
    ).resolves.toBe(true);
  });

  describe('al arrancar', () => {
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
      log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => jest.restoreAllMocks());

    it.each([
      ['created', 'Usuario de pruebas e2e creado.'],
      ['updated', 'Usuario de pruebas e2e actualizado.'],
    ] as const)(
      'registra cuando el usuario quedó %s',
      async (result, message) => {
        const seed = service();
        jest.spyOn(seed, 'ensureE2eUser').mockResolvedValue(result);

        await seed.onApplicationBootstrap();

        expect(log).toHaveBeenCalledWith(message);
      },
    );

    it.each(['ok', 'skipped'] as const)(
      'no registra nada si quedó %s',
      async (result) => {
        const seed = service();
        jest.spyOn(seed, 'ensureE2eUser').mockResolvedValue(result);

        await seed.onApplicationBootstrap();

        expect(log).not.toHaveBeenCalled();
      },
    );

    it('un error que no es Error también se registra', async () => {
      users.findOne.mockRejectedValue('sin conexión');

      await service().onApplicationBootstrap();

      expect(warn).toHaveBeenCalledWith(
        'No se pudo preparar el usuario e2e: sin conexión',
      );
    });
  });
});
