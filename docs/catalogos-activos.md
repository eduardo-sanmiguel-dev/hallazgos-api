# Catálogos activos y reactivación

Los formularios de captura y los selectores de filtros consultan catálogos activos. Las relaciones históricas de registros ya guardados se conservan.

Las 14 tablas de Configuración solicitan `includeInactive=true`, muestran el estado y permiten estas acciones:

- Activo: editar y eliminar/desactivar, sujeto a las restricciones existentes.
- Inactivo: reactivar. No permite editar ni eliminar de nuevo.
- Calendario Gemba Walk pasado: conserva la restricción de fecha; debe crearse una nueva programación.

La API permite consultar inactivos y reactivar solo a administradores. Conserva el alcance de las consultas existentes y valida las plantas asignadas al reactivar registros asociados a ellas.

`PATCH /api/v1/catalogs/:catalog/:id/activate` reactiva en una transacción con bloqueo del registro. Acepta los catálogos `users`, `employees`, `manufacturing-plants`, `zones`, `areas`, `processes`, `main-types`, `secondary-types`, `equipments`, `emergency-teams`, `gemba-walk-zones`, `gemba-walk-observers`, `gemba-walk-calendar` y `gemba-walk-evaluations`.

La operación es idempotente para un registro ya activo. Verifica dependencias activas, pertenencia a planta, duplicados y fechas de calendario. No reactiva automáticamente sus dependencias: el mensaje indica qué registro debe habilitarse primero.

Los listados normales conservan su contrato y excluyen inactivos. En colaboradores, `isActive=false` solo consulta inactivos junto con `includeInactive=true`; el listado administrativo inicia con estado Todos.

No requiere nuevas variables de entorno ni migraciones. Desplegar primero API y después UI: la UI nueva necesita el parámetro y la ruta de reactivación de la API nueva. El despliegue no reactiva registros existentes por sí mismo.

Validación: `test/db/catalog-lifecycle.db-spec.ts` cubre los 14 catálogos con PostgreSQL real; `e2e/catalog-lifecycle.spec.ts` verifica estado, exclusividad de acciones, solicitud de inactivos y reactivación desde la UI.
