# Meta de cobertura de la API

Metas del reporte unitario completo, incluido dashboard.service.ts:

| Métrica    | Mínimo |
| ---------- | -----: |
| Sentencias |    85% |
| Ramas      |    80% |
| Funciones  |    85% |
| Líneas     |    85% |

Ejecutar pnpm test:cov:goal para generar el reporte y comprobar las cuatro metas. GitHub Actions también ejecuta scripts/coverage-goal.js después de las pruebas unitarias; una métrica por debajo del mínimo bloquea ese job y, por dependencia, el deploy. Se conservan los umbrales existentes por carpeta y las mismas exclusiones del reporte. No se eliminan archivos ni se altera el denominador para alcanzar las metas.

Las nuevas pruebas del dashboard cubren filtros de planta/área/tipo, fechas inválidas y límites de día, tipos restringidos por usuario, ausencia de datos, fallback de responsables a supervisores, conteos, ordenación de series, mapa de calor y pronóstico mensual. Simulan únicamente las lecturas de almacenamiento; las consultas SQL siguen verificándose con PostgreSQL temporal en el job independiente de integración.

Estas pruebas unitarias no abren conexiones a PostgreSQL ni envían correos. No requieren cambios de UI.

## Resultado verificado

1,327 pruebas en 74 suites. Sentencias 96.88%, ramas 91.99%, funciones 91.23% y líneas 96.95%. Se mantiene el mismo total de código medido: 4,660 sentencias, 1,748 ramas, 1,095 funciones y 4,342 líneas.

Jest usa por defecto dos procesos y recicla cada uno al superar 256 MB de memoria en reposo. La ejecución completa pasó con esa configuración después de observar terminaciones nativas con la ejecución en un solo proceso en Windows. El job de CI conserva su ejecución en serie sobre Linux.
