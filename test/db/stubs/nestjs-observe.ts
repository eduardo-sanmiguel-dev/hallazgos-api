/**
 * Sustituto de `@nestjs/observe` para las pruebas con base de datos
 * (moduleNameMapper en test/jest-db.json).
 *
 * El paquete se publica solo como ESM y ObserveIntegrationModule lo carga con
 * require(): Node 24 lo permite, pero el sistema de módulos de Jest no. En
 * pruebas tampoco debe enviar telemetría, así que se reemplaza por un módulo
 * vacío con la misma forma.
 */
import { DynamicModule, Module } from '@nestjs/common';

@Module({})
class ObserveModule {
  static forRoot(): DynamicModule {
    return { module: ObserveModule };
  }
}

export const createObserveModule = () => ({ ObserveModule });
