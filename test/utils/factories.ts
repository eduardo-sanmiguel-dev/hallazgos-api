import { Evidence } from '../../src/evidences/entities/evidence.entity.js';
import { ManufacturingPlant } from '../../src/manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from '../../src/users/entities/user.entity.js';
import {
  ROLE_ADMINISTRADOR,
  ROLE_GENERAL,
  ROLE_SUPERVISOR,
  STATUS_OPEN,
} from '../../src/shared/constants/index.js';

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

/** Hallazgo abierto con creador, supervisor y responsable (sin comentarios). */
export const buildEvidence = (overrides: Partial<Evidence> = {}): Evidence =>
  ({
    id: id(),
    imgEvidence: 'uuid-evidence.png',
    imgSolution: '',
    imgProcess: null,
    description: 'Derrame en pasillo',
    descriptionSolution: '',
    status: STATUS_OPEN,
    isActive: true,
    priorityDays: null,
    createdAt: new Date('2026-10-01T15:00:00Z'),
    updatedAt: new Date('2026-10-01T15:00:00Z'),
    manufacturingPlant: buildManufacturingPlant({ id: 1 }),
    mainType: { id: 1, name: 'Condición insegura' },
    secondaryType: { id: 2, name: 'Orden y limpieza' },
    zone: { id: 3, name: 'Almacén' },
    process: { id: 4, name: 'Producción' },
    user: buildUser({ name: 'Quien reportó' }),
    supervisors: [buildSupervisor({ name: 'Supervisor del área' })],
    responsibles: [buildUser({ name: 'Responsable del proceso' })],
    comments: [],
    ...overrides,
  }) as Evidence;
