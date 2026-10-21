# Flujos críticos protegidos y pruebas de regresión

## Autenticación

La recuperación verifica firma, propósito, vigencia, usuario activo y huella de
contraseña. Su escritura compara el hash anterior y el estado activo en el mismo
UPDATE: solo una petición simultánea puede consumir el token. Un fallo de escritura
no emite sesión. Los JWT requieren un userId entero positivo; se conserva la
compatibilidad temporal de sesiones antiguas sin purpose.

## Permisos

POST, PATCH y DELETE de usuarios requieren Administrador. La lectura y escritura
por ID de usuarios y empleados se limita a plantas compartidas. No se permite
asignar a usuarios plantas que el administrador no tiene. El lookup interno usado
por el middleware JWT permanece separado del lookup de recursos HTTP.

Los historiales EPP se filtran por la planta de cada equipo, incluso si el empleado
pertenece a varias plantas. No se puede borrar una entrega completa que contenga
renglones de plantas ajenas.

## Hallazgos

Se conservan los permisos y transiciones ya establecidos. Inicio, cierre y
cancelación usan UPDATE condicionado al estado actual. La reasignación bloquea
la fila, verifica estado y updatedAt, y solo guarda responsables y fecha de
modificación, dentro de una transacción. No puede reabrir un hallazgo concurrentemente
cerrado ni enviar aviso cuando la validación falla.

## EPP y consistencia de escrituras

Cabecera y renglones se crean o eliminan en una sola transacción. Empleado y
equipo deben compartir una planta autorizada; cantidades e IDs son enteros
positivos, la firma no es vacía y no hay equipos duplicados en el cuerpo.

Las entregas de un mismo empleado se serializan con bloqueo de fila. Se conserva
la regla existente: una entrega anticipada se permite y se marca fuera de rango.
El historial desactivado no cuenta para calcular la frecuencia.

## Verificación

Las pruebas unitarias cubren rechazos antes de escribir, roles, JWT, solicitudes
simultáneas y filtros. La suite test/db/critical-flows.db-spec.ts verifica con
PostgreSQL real: recuperación concurrente, carreras de cierre/cancelación/reasignación,
rollback de creación y borrado de EPP mediante fallos deliberados en triggers,
frecuencia concurrente y empleados compartidos entre plantas.

Esta suite usa la configuración jest-db y se descubre automáticamente en el job
database-tests de Actions, que levanta PostgreSQL temporal sin secretos del VPS.
No requiere migraciones nuevas. Los pendientes de otros módulos siguen descritos
en pendientes-seguridad.md.
