import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { User } from 'users/entities/user.entity';
import {
  ROLE_ADMINISTRADOR,
  ROLE_GENERAL,
  ROLE_SUPERVISOR,
} from '@shared/constants';

/**
 * Factories de datos de prueba: objetos planos con valores por defecto
 * razonables; cada test sobrescribe solo lo que le importa.
 */
let nextId = 1000;
const id = () => nextId++;

export const buildManufacturingPlant = (
  overrides: Partial<ManufacturingPlant> = {},
): ManufacturingPlant =>
  ({
    id: id(),
    name: 'Tepotzotlán',
    isActive: true,
    ...overrides,
  }) as ManufacturingPlant;

export const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: id(),
    name: 'Usuario de prueba',
    email: `usuario${nextId}@hallazgos.test`,
    role: ROLE_GENERAL,
    isActive: true,
    manufacturingPlants: [buildManufacturingPlant()],
    ...overrides,
  }) as User;

export const buildAdmin = (overrides: Partial<User> = {}): User =>
  buildUser({ role: ROLE_ADMINISTRADOR, ...overrides });

export const buildSupervisor = (overrides: Partial<User> = {}): User =>
  buildUser({ role: ROLE_SUPERVISOR, ...overrides });
