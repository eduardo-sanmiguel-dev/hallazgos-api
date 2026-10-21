import { type Provider, type Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ObjectLiteral } from 'typeorm';

import { RequestContextService } from '../../src/shared/services/request-context.service.js';
import {
  createRepositoryMock,
  type RepositoryMock,
} from './repository.mock.js';

/**
 * Proveedor simulado de una clase: cada método del prototipo es un jest.fn().
 * `overrides` fija implementaciones concretas.
 */
export const mockProvider = <T>(
  token: Type<T>,
  overrides: Partial<Record<keyof T, unknown>> = {},
): Provider => {
  const methods = Object.getOwnPropertyNames(token.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      typeof Object.getOwnPropertyDescriptor(token.prototype, name)?.value ===
        'function',
  );
  const value = Object.fromEntries(methods.map((name) => [name, jest.fn()]));
  return { provide: token, useValue: { ...value, ...overrides } };
};

interface ServiceTestingModuleOptions {
  /** Entidades cuyo repositorio se inyecta (se simula). */
  repositories?: Type<ObjectLiteral>[];
  /** Otros proveedores: normalmente mockProvider(OtroServicio). */
  providers?: Provider[];
}

/**
 * Arma un TestingModule para un servicio con sus repositorios simulados y el
 * RequestContextService real (úsalo junto con runAsUser).
 */
export const createServiceTestingModule = async <T>(
  service: Type<T>,
  { repositories = [], providers = [] }: ServiceTestingModuleOptions = {},
) => {
  const repositoryMocks = new Map<Type<ObjectLiteral>, RepositoryMock<any>>();

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      service,
      RequestContextService,
      ...repositories.map((entity) => {
        const mock = createRepositoryMock();
        repositoryMocks.set(entity, mock);
        return { provide: getRepositoryToken(entity), useValue: mock };
      }),
      ...providers,
    ],
  }).compile();

  return {
    moduleRef,
    service: moduleRef.get(service),
    /** Repositorio simulado de la entidad indicada. */
    repository: <E extends ObjectLiteral>(entity: Type<E>) =>
      repositoryMocks.get(entity) as RepositoryMock<E>,
    /** Otro proveedor ya resuelto (p. ej. un servicio simulado). */
    get: <P>(token: Type<P>) => moduleRef.get(token) as jest.Mocked<P>,
  };
};
