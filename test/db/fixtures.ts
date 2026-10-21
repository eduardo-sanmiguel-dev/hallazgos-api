/**
 * Datos base para las pruebas con base de datos: dos plantas (México y
 * Colombia), un usuario por rol y el catálogo mínimo para crear hallazgos.
 * Todas las cuentas usan TEST_PASSWORD.
 */
import * as argon2 from 'argon2';
import { DataSource, type DeepPartial, type ObjectLiteral } from 'typeorm';

import { Area } from '../../src/areas/entities/area.entity.js';
import { Country } from '../../src/countries/entities/country.entity.js';
import { Evidence } from '../../src/evidences/entities/evidence.entity.js';
import { MainType } from '../../src/main-types/entities/main-type.entity.js';
import { ManufacturingPlant } from '../../src/manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Processes } from '../../src/processes/entities/processes.entity.js';
import { SecondaryType } from '../../src/secondary-types/entities/secondary-type.entity.js';
import {
  ROLE_ADMINISTRADOR,
  ROLE_GENERAL,
  ROLE_SUPERVISOR,
  STATUS_CANCEL,
  STATUS_CLOSE,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
} from '../../src/shared/constants/index.js';
import { User } from '../../src/users/entities/user.entity.js';
import { Zone } from '../../src/zones/entities/zone.entity.js';

export const TEST_PASSWORD = 'Clave-Prueba-1';

/** Borra todos los datos (conserva el esquema y la tabla de migraciones). */
export const truncateAll = async (dataSource: DataSource) => {
  const tables = dataSource.entityMetadatas
    .map(({ tableName }) => `"${tableName}"`)
    .join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
};

const save = <T extends ObjectLiteral>(
  dataSource: DataSource,
  entity: new () => T,
  values: DeepPartial<T>,
) => dataSource.getRepository(entity).save(values as T);

export const seedBaseData = async (dataSource: DataSource) => {
  await truncateAll(dataSource);

  const mexico = await save(dataSource, Country, { name: 'México' });
  const colombia = await save(dataSource, Country, { name: 'Colombia' });

  const tepotzotlan = await save(dataSource, ManufacturingPlant, {
    name: 'Tepotzotlán',
    link: 'https://maps.test/tepotzotlan',
    lat: 19.71,
    lng: -99.22,
    country: mexico,
  });
  const manizales = await save(dataSource, ManufacturingPlant, {
    name: 'Manizales',
    link: 'https://maps.test/manizales',
    lat: 5.07,
    lng: -75.52,
    country: colombia,
  });

  const password = await argon2.hash(TEST_PASSWORD);
  const user = (
    name: string,
    email: string,
    role: string,
    plants: ManufacturingPlant[],
  ) =>
    save(dataSource, User, {
      name,
      email,
      password,
      role,
      manufacturingPlants: plants,
    });

  const admin = await user(
    'Admin Pruebas',
    'admin@hallazgos.test',
    ROLE_ADMINISTRADOR,
    [tepotzotlan, manizales],
  );
  const supervisor = await user(
    'Supervisor Pruebas',
    'supervisor@hallazgos.test',
    ROLE_SUPERVISOR,
    [tepotzotlan],
  );
  const general = await user(
    'General Pruebas',
    'general@hallazgos.test',
    ROLE_GENERAL,
    [tepotzotlan],
  );
  const generalColombia = await user(
    'General Colombia',
    'general.co@hallazgos.test',
    ROLE_GENERAL,
    [manizales],
  );

  const area = await save(dataSource, Area, {
    name: 'Almacén',
    manufacturingPlant: tepotzotlan,
    createdBy: admin,
  });
  const zone = await save(dataSource, Zone, {
    name: 'Pasillo norte',
    manufacturingPlant: tepotzotlan,
    area,
    createdBy: admin,
  });
  const zoneColombia = await save(dataSource, Zone, {
    name: 'Bodega',
    manufacturingPlant: manizales,
    createdBy: admin,
  });
  const process = await save(dataSource, Processes, {
    name: 'Producción',
    manufacturingPlant: tepotzotlan,
  });
  const processColombia = await save(dataSource, Processes, {
    name: 'Calidad',
    manufacturingPlant: manizales,
  });
  const mainType = await save(dataSource, MainType, {
    name: 'Condición insegura',
  });
  const secondaryType = await save(dataSource, SecondaryType, {
    name: 'Orden y limpieza',
    mainType,
  });

  // El supervisor atiende la zona y el proceso de Tepotzotlán (los
  // responsables de un proceso son supervisores con ese proceso).
  await dataSource
    .createQueryBuilder()
    .relation(User, 'zones')
    .of(supervisor)
    .add(zone);
  await dataSource
    .createQueryBuilder()
    .relation(User, 'processes')
    .of(supervisor)
    .add(process);

  return {
    plants: { tepotzotlan, manizales },
    users: { admin, supervisor, general, generalColombia },
    area,
    zone,
    zoneColombia,
    process,
    processColombia,
    mainType,
    secondaryType,
  };
};

export type BaseData = Awaited<ReturnType<typeof seedBaseData>>;

/** Hallazgo listo para guardar; cada prueba ajusta lo que necesita. */
export const saveEvidence = (
  dataSource: DataSource,
  base: BaseData,
  overrides: DeepPartial<Evidence> = {},
) =>
  save(dataSource, Evidence, {
    imgEvidence: 'uuid-evidence.png',
    status: STATUS_OPEN,
    description: 'Derrame en pasillo',
    manufacturingPlant: base.plants.tepotzotlan,
    mainType: base.mainType,
    secondaryType: base.secondaryType,
    zone: base.zone,
    process: base.process,
    user: base.users.general,
    supervisors: [base.users.supervisor],
    responsibles: [base.users.general],
    ...overrides,
  });

export const STATUSES = {
  open: STATUS_OPEN,
  inProgress: STATUS_IN_PROGRESS,
  closed: STATUS_CLOSE,
  cancelled: STATUS_CANCEL,
};
