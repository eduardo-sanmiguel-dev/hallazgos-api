import * as argon2 from 'argon2';
import type { ConfigService } from '@nestjs/config';

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
});
