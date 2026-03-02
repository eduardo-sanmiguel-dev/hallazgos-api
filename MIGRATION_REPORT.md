# MIGRATION_REPORT

## Resumen ejecutivo

- Fecha: 2026-03-02
- Estado: **Fase 0 completada**
- Proyecto: `hallazgos-api`
- Objetivo: migración de NestJS 10 → 11, Apollo Server 4 → 5, TypeORM 0.3.17 → 0.3.28, TypeScript 5.6 → 5.8.

---

## Skills encontrados en `.agents/` y aplicados

Se encontró y aplicó el skill:

- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/nestjs-best-practices/AGENTS.md`
- `.agents/skills/nestjs-best-practices/README.md`
- Reglas en `.agents/skills/nestjs-best-practices/rules/*.md` (40 reglas)

Convenciones internalizadas y aplicadas para esta migración:

- Arquitectura por módulos de dominio, evitando dependencias circulares.
- DI por constructor (sin service locator).
- Seguridad y validación estricta de entradas.
- Manejo consistente de errores y logging estructurado.
- Buenas prácticas TypeORM (transacciones, evitar N+1, migraciones).

---

## FASE 0 — Auditoría completa del proyecto

### 1) Auditoría de Node.js

- `node --version`: **v24.13.0** ✅
- Requisito NestJS 11: `>= v20` ✅ cumplido.
- `.nvmrc`: no existe.
- `.node-version`: no existe.
- Dockerfile con versión pinneada: no encontrado en el workspace.

### 2) Auditoría NestJS core

Hallazgos buscados:

- `@Get('*')`, `@Post('*')`, `@All('*')` en controladores: **sin coincidencias**.
- `plainToClass`: **sin coincidencias**.
- `@ReflectMetadata`: **sin coincidencias**.
- Rutas con `?` o `+` en decoradores: **sin coincidencias**.
- `Reflector.getAllAndMerge`: **sin coincidencias**.
- `Reflector.getAllAndOverride`: **sin coincidencias**.

### 3) Auditoría GraphQL / Apollo

Archivo principal:

- `src/app.module.ts`

Hallazgos:

- Usa `GraphQLModule.forRootAsync<ApolloDriverConfig>`.
- Config actual:
  - `playground: false`
  - `plugins: [ApolloServerPluginLandingPageLocalDefault()]`
  - `introspection: true`
  - `autoSchemaFile: join(process.cwd(), 'src/schema.gql')`
- Enfoque GraphQL detectado: **code-first** (genera `src/schema.gql`).
- `ApolloFederationDriver`: no usado.
- `ApolloGatewayDriver`: no usado.
- `subscriptions-transport-ws`: no usado.
- `@Plugin()` decorator: no encontrado.

Riesgo a revisar en migración Apollo 5:

- Verificar compatibilidad de plugin de landing page y comportamiento por entorno.

### 4) Auditoría TypeORM

- Versión actual `typeorm`: `^0.3.17` (objetivo `^0.3.28`).
- Versión actual `@nestjs/typeorm`: `^10.0.0` (objetivo `^11.0.0`).
- `getConnection()`: sin coincidencias.
- `getManager()`: sin coincidencias.
- `getRepository()`: sin coincidencias.
- Patrón activo: `TypeOrmModule.forRoot` + `TypeOrmModule.forFeature` (correcto para 0.3.x).

Migraciones:

- No se encontró carpeta de migraciones (`src/migrations/**`) ni archivos `*migration*.ts`.
- Hallazgo crítico de scripts:
  - `seed:dev` y `seed:prod` apuntan a `src/config/typeorm.config.ts`
  - Ese archivo **no existe** actualmente.

### 5) Auditoría Express v5 (crítica)

Hallazgos de ruptura potencial:

- `src/app.module.ts`
  - `consumer.apply(AppKeyMiddleware).forRoutes('*');`
  - `.forRoutes('*');` en `JwtMiddleware`

No se encontraron:

- `app.use('*', ...)`
- `setGlobalPrefix(...)` con regex/patrones complejos.

Observación:

- `src/main.ts` usa `app.setGlobalPrefix('/api/v1')`; no es regex y no representa ruptura directa.

### 6) Auditoría `@nestjs/config`

Uso detectado de `ConfigService.get()`:

- `src/mail/mail.module.ts` (MAIL_HOST, MAIL_USER, MAIL_PASSWORD)
- `src/app.module.ts` (`appKey` en contexto GraphQL)

Posible impacto por cambio de precedencia en NestJS 11:

- `EnvConfiguration` define `appKey` y `email.*` en fábrica custom.
- En v11, los valores de fábrica custom tienen prioridad sobre `process.env`.
- Riesgo: bajo/medio, pero debe validarse que las claves leídas (`appKey`, `MAIL_*`) mantengan el valor esperado en runtime.

### 7) Matriz de riesgo de dependencias

#### Dependencias

- 🟡 REVIEW: `@apollo/server` (4→5, cambios de comportamiento/plugins/csrf)
- 🔴 FREEZE: `@nestjs-modules/mailer` (sin upgrade solicitado; mantener y validar compatibilidad)
- 🟡 REVIEW: `@nestjs/apollo` (12→13, alineación con Apollo 5)
- 🟡 REVIEW: `@nestjs/common` (10→11, breaking changes core)
- 🟡 REVIEW: `@nestjs/config` (3→4, cambio de precedencia en `get`)
- 🟡 REVIEW: `@nestjs/core` (10→11, bootstrap/lifecycle)
- 🟡 REVIEW: `@nestjs/graphql` (12→13, integración Apollo)
- 🟢 SAFE: `@nestjs/mapped-types` (`*`, sin cambio funcional forzado)
- 🟡 REVIEW: `@nestjs/platform-express` (10→11, Express v5)
- 🟡 REVIEW: `@nestjs/serve-static` (4→5, compatibilidad Express v5)
- 🟡 REVIEW: `@nestjs/typeorm` (10→11, compatibilidad Nest 11)
- 🟢 SAFE: `argon2`
- 🟢 SAFE: `class-transformer`
- 🟢 SAFE: `class-validator`
- 🟢 SAFE: `cookie` (actualización menor)
- 🟢 SAFE: `cookie-parser`
- 🟢 SAFE: `exceljs`
- 🟢 SAFE: `graphql` (se mantiene 16.9.0)
- 🟢 SAFE: `handlebars`
- 🟢 SAFE: `joi`
- 🟢 SAFE: `jsonwebtoken`
- 🟢 SAFE: `moment`
- 🟢 SAFE: `nodemailer`
- 🟢 SAFE: `pdfmake`
- 🟢 SAFE: `pg` (patch)
- 🟢 SAFE: `reflect-metadata`
- 🟢 SAFE: `rxjs`
- 🟢 SAFE: `typeorm` (patch dentro de 0.3.x)
- 🔴 FREEZE: `typeorm-extension` (se mantiene; requiere verificación en seed runtime)
- 🟢 SAFE: `xlsx-populate`

#### DevDependencies

- 🟡 REVIEW: `@nestjs/cli` (10→11)
- 🟡 REVIEW: `@nestjs/schematics` (10→11)
- 🟡 REVIEW: `@nestjs/testing` (10→11)
- 🟡 REVIEW: `@types/express` (4→5)
- 🟢 SAFE: `@types/jest`
- 🟢 SAFE: `@types/multer`
- 🟡 REVIEW: `@types/node` (20→22)
- 🟢 SAFE: `@types/nodemailer`
- 🟢 SAFE: `@types/pdfmake`
- 🟢 SAFE: `@types/supertest`
- 🟡 REVIEW: `@typescript-eslint/eslint-plugin` (7→8)
- 🟡 REVIEW: `@typescript-eslint/parser` (7→8)
- 🟢 SAFE: `cross-env`
- 🟢 SAFE: `eslint`
- 🟢 SAFE: `eslint-config-prettier`
- 🟢 SAFE: `eslint-plugin-prettier`
- 🟢 SAFE: `jest` (29.5→29.7)
- 🟢 SAFE: `prettier`
- 🟢 SAFE: `source-map-support`
- 🟢 SAFE: `supertest`
- 🟢 SAFE: `ts-jest`
- 🟢 SAFE: `ts-loader`
- 🟢 SAFE: `ts-node`
- 🟢 SAFE: `tsconfig-paths`
- 🟡 REVIEW: `typescript` (5.6→5.8)

---

## Deuda técnica identificada en Fase 0

- `typeorm-extension` se mantiene en versión actual (sin evidencia local de versión superior validada con esta base de código).
- `@nestjs-modules/mailer` se mantiene en versión actual; requiere prueba de runtime tras upgrade Nest 11.
- Scripts de seed referencian archivo inexistente: `src/config/typeorm.config.ts`.

---

## Próximas fases

- Fase 1: actualización de `package.json` + `pnpm install` + `pnpm run build` (sin corregir errores todavía, solo registrar).
- Fase 2+: corrección progresiva de ruptura Express/Apollo/Nest/TypeORM/TS.

---

## FASE 1 — Actualización de `package.json` + instalación

### Cambios aplicados

- Se actualizaron dependencias y devDependencies a las versiones objetivo de migración.
- Se removió `multer` de `dependencies` para alinear con el objetivo solicitado.

### Resultado de instalación (`pnpm install`)

- Instalación completada correctamente.
- Advertencias de peer dependencies detectadas:
  - `@apollo/server@5.4.0` y `@nestjs/graphql@13.x` esperan `graphql@^16.11.0`; actualmente `graphql@16.9.0` (se mantiene por requerimiento de alcance).
  - `@nestjs/apollo@13.x` reporta peer de `graphql` similar.
  - `@apollo/server-plugin-landing-page-graphql-playground@4.0.1` aparece como subdependencia transitiva incompatible con `@apollo/server@5`.
  - `@nestjs/mapped-types@2.0.5` reporta peer hasta Nest 10.

### Resultado de compilación (`pnpm run build`)

- ✅ Build exitoso.
- Errores de compilación registrados en esta fase: **ninguno**.

### Notas para fases siguientes

- Las advertencias de peer se gestionarán en fases 3-4 mediante ajustes de configuración/código, sin cambiar contrato GraphQL del frontend.

---

## FASE 2 — Sintaxis de rutas Express v5

### Cambios aplicados

- `src/app.module.ts`
  - `consumer.apply(AppKeyMiddleware).forRoutes('*')` → `forRoutes('/')`
  - `consumer.apply(JwtMiddleware)...forRoutes('*')` → `forRoutes('/')`

### Resultado de compilación (`pnpm run build`)

- ✅ Build exitoso.
- Errores de compilación: **ninguno**.

---

## FASE 3 — Apollo Server 4 → 5 y `@nestjs/graphql` v13

### Cambios aplicados

- `src/app.module.ts`
  - Se removió la propiedad `playground` de `GraphQLModule.forRootAsync`.
  - Se removió el plugin `ApolloServerPluginLandingPageLocalDefault`.
  - Se ajustó introspección a entorno:
    - `introspection: process.env.NODE_ENV !== 'production'`

### Verificaciones

- `@Plugin()` desde `@nestjs/graphql`: no aplica (no existe uso en el código).
- `subscriptions-transport-ws`: no detectado en el código.
- `ApolloFederationDriver` / `ApolloGatewayDriver`: no usados.

### Resultado de compilación (`pnpm run build`)

- ✅ Build exitoso.
- Errores de compilación: **ninguno**.
