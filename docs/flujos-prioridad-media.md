# Flujos de prioridad media

## Gemba Walk

Solo Administradores crean, editan y desactivan zonas, conceptos, observadores y programación. Los observadores conservan sus recorridos. Las consultas y modificaciones quedan limitadas a las plantas asignadas, también para Administradores. La programación valida las zonas dentro de ese alcance.

## Inspecciones de extintores

Crear, listar, consultar, editar, eliminar y descargar comprueban el alcance por planta. Crear, reemplazar evaluaciones y desactivar se guardan en transacciones. Se validan fechas reales de calendario YYYY-MM-DD en altas y ediciones, usando el día de la planta para detectar fechas pasadas.

## Archivos

Las URLs actuales de imágenes de hallazgos e ICS exigen sesión válida y un registro asociado a una planta asignada al usuario. Devuelven Cache-Control: private, no-store. El middleware se registra antes de servir estáticos y normaliza separadores y rutas codificadas. Las descargas HDS y las imágenes usadas por PDF comprueban la ruta real y rechazan escapes por enlaces simbólicos.

Los correos adjuntan imágenes desde disco en todos los entornos. La UI usa unoptimized en las imágenes privadas para que el navegador envíe la cookie de sesión; desplegar ese ajuste junto con la API. Los clientes móviles deben enviar su token al descargar las imágenes.

## Fechas y reportes

Los filtros DD/MM/YYYY rechazan fechas inexistentes, texto sobrante y valores repetidos que se convierten en arrays. Las pruebas cubren límites de día entre México y Colombia, conversiones IANA y desfases horarios. Se mantienen los contratos y cálculos existentes del dashboard, verificados con PostgreSQL real.

## Pruebas

Las pruebas unitarias cubren rutas seguras, sesión de imágenes y zonas horarias. medium-flows.db-spec.ts verifica roles, aislamiento por planta, descargas, imágenes con cookie y rollback al fallar una escritura de evaluaciones. La suite existente de Gemba verifica que los observadores siguen completando sus recorridos. GitHub Actions descubre los nuevos archivos con sus configuraciones actuales, sin otro job.

## Catálogos, ICS y equipos de emergencia

Solo Administradores escriben catálogos generales y CIAEL, incluida la carga de reglas de vida. Las consultas permanecen disponibles con sesión. ICS y equipos de emergencia filtran lecturas y modificaciones por las plantas del usuario. ICS verifica además que los empleados pertenezcan a la planta del registro.
