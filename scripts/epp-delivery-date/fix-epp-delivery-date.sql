-- =============================================================================
-- Corrección de epp_equipment."deliveryDate" (fecha de entrega de EPP)
-- =============================================================================
--
-- PROBLEMA
--   La API guardaba deliveryDate (columna `date`) con el día en UTC del instante
--   de la entrega. Toda entrega a partir de las 18:00 en México (19:00 en
--   Bogotá) quedó con el día siguiente. La API corregida calcula el día en la
--   zona horaria de la planta (src/epps/epp-delivery-date.ts).
--
-- QUÉ HACE
--   Recalcula deliveryDate como el día de "createdAt" (timestamptz, instante
--   real de la entrega) en la zona de la planta del equipo entregado:
--     planta → país → zona (Colombia → America/Bogota; cualquier otro país o
--     sin país → America/Mexico_City), igual que PLANT_TIME_ZONES/toPlantCountry
--     en la API.
--   Solo toca las filas donde la fecha no coincide.
--
-- FILAS EXCLUIDAS
--   Las filas cuyo createdAt se repite en varias filas. Al crear la columna
--   createdAt, las entregas anteriores recibieron todas el mismo valor (en la
--   copia de producción revisada: 897 filas con '2026-03-05 14:41:57.151-06');
--   ese valor no es la hora real de la entrega, así que esas filas no se
--   pueden recalcular y se dejan como están. Las entregas reales tienen un
--   createdAt único. La consulta previa muestra cuántas se excluyen.
--
-- RESPALDO
--   public.epp_equipment_delivery_date_backup guarda, por id, la fecha
--   original y la nueva. La reversa restaura desde ahí.
--
-- IDEMPOTENCIA
--   - apply: una segunda ejecución no encuentra filas por corregir.
--   - revert: restaura solo las filas que siguen con la fecha corregida y
--     borra su respaldo; una segunda ejecución no hace nada.
--   - apply y revert corren completos dentro de una transacción.
--
-- CÓMO SE EJECUTA
--   No se ejecuta a mano: lo corre el comando de la API, que toma la conexión
--   del .env del entorno en tiempo de ejecución (este archivo no tiene nombres
--   de base ni credenciales):
--
--     npm run fix:epp-delivery-date -- <dev|prod> <preview|apply|revert|status>
--
--   preview  consulta previa, en una transacción de solo lectura.
--   apply    muestra la consulta previa y aplica la corrección.
--   revert   restaura las fechas originales desde el respaldo.
--   status   estado del respaldo (solo lectura).
--
--   Con "prod", antes de apply o revert el comando muestra la base conectada y
--   la consulta previa, y pide escribir el nombre de la base para continuar.
--
-- ORDEN EN PRODUCCIÓN
--   1. Desplegar la API corregida (las entregas nuevas ya se guardan bien).
--   2. npm run fix:epp-delivery-date -- prod preview   (revisar conteos y muestra)
--   3. npm run fix:epp-delivery-date -- prod apply     (confirmar con el nombre de la base)
--   4. npm run fix:epp-delivery-date -- prod preview   (debe mostrar 0 por corregir)
--   Si hay que deshacer: npm run fix:epp-delivery-date -- prod revert
--   Cuando ya no se necesite la reversa, la tabla de respaldo se puede borrar:
--     DROP TABLE public.epp_equipment_delivery_date_backup;
--
-- Cada sección empieza con una línea "-- @@ <nombre>".
-- =============================================================================


-- @@ preview
-- Consulta previa (solo lectura): resumen y muestra de 20 filas.
WITH entregas AS (
  SELECT ee.id,
         ee."deliveryDate" AS fecha_actual,
         ee."createdAt",
         mp.name AS planta,
         COALESCE(c.name, '(sin país)') AS pais,
         (ee."createdAt" AT TIME ZONE
            CASE WHEN c.name = 'Colombia' THEN 'America/Bogota'
                 ELSE 'America/Mexico_City' END)::date AS fecha_nueva,
         count(*) OVER (PARTITION BY ee."createdAt") > 1 AS created_at_repetido
  FROM public.epp_equipment ee
  JOIN public.equipment eq ON eq.id = ee."equipmentId"
  LEFT JOIN public.manufacturing_plant mp ON mp.id = eq."manufacturingPlantId"
  LEFT JOIN public.countries c ON c.id = mp."countryId"
)
SELECT pais,
       count(*) AS total_filas,
       count(*) FILTER (WHERE created_at_repetido) AS excluidas_created_at_repetido,
       count(*) FILTER (WHERE NOT created_at_repetido
                          AND fecha_actual IS DISTINCT FROM fecha_nueva) AS cambiarian,
       count(*) FILTER (WHERE NOT created_at_repetido
                          AND fecha_actual = fecha_nueva + 1) AS de_ellas_un_dia_adelante
FROM entregas
GROUP BY pais
ORDER BY pais;

WITH entregas AS (
  SELECT ee.id,
         ee."deliveryDate" AS fecha_actual,
         ee."createdAt",
         mp.name AS planta,
         (ee."createdAt" AT TIME ZONE
            CASE WHEN c.name = 'Colombia' THEN 'America/Bogota'
                 ELSE 'America/Mexico_City' END)::date AS fecha_nueva,
         count(*) OVER (PARTITION BY ee."createdAt") > 1 AS created_at_repetido
  FROM public.epp_equipment ee
  JOIN public.equipment eq ON eq.id = ee."equipmentId"
  LEFT JOIN public.manufacturing_plant mp ON mp.id = eq."manufacturingPlantId"
  LEFT JOIN public.countries c ON c.id = mp."countryId"
)
SELECT id,
       planta,
       "createdAt" AS creado,
       fecha_actual,
       fecha_nueva
FROM entregas
WHERE NOT created_at_repetido
  AND fecha_actual IS DISTINCT FROM fecha_nueva
ORDER BY id DESC
LIMIT 20;


-- @@ apply
-- Corrección. Respalda (id, fecha original, fecha nueva) y actualiza, todo en
-- una transacción.
BEGIN;

CREATE TABLE IF NOT EXISTS public.epp_equipment_delivery_date_backup (
  id integer PRIMARY KEY,
  original_delivery_date date NOT NULL,
  new_delivery_date date NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

WITH entregas AS (
  SELECT ee.id,
         ee."deliveryDate" AS fecha_actual,
         (ee."createdAt" AT TIME ZONE
            CASE WHEN c.name = 'Colombia' THEN 'America/Bogota'
                 ELSE 'America/Mexico_City' END)::date AS fecha_nueva,
         count(*) OVER (PARTITION BY ee."createdAt") > 1 AS created_at_repetido
  FROM public.epp_equipment ee
  JOIN public.equipment eq ON eq.id = ee."equipmentId"
  LEFT JOIN public.manufacturing_plant mp ON mp.id = eq."manufacturingPlantId"
  LEFT JOIN public.countries c ON c.id = mp."countryId"
  WHERE ee."createdAt" IS NOT NULL
),
candidatos AS (
  SELECT id, fecha_actual, fecha_nueva
  FROM entregas
  WHERE NOT created_at_repetido
    AND fecha_actual IS DISTINCT FROM fecha_nueva
),
respaldo AS (
  -- Si la fila ya tenía respaldo, se conserva la fecha original más antigua.
  INSERT INTO public.epp_equipment_delivery_date_backup
    (id, original_delivery_date, new_delivery_date)
  SELECT id, fecha_actual, fecha_nueva
  FROM candidatos
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE public.epp_equipment ee
SET "deliveryDate" = c.fecha_nueva
FROM candidatos c
WHERE ee.id = c.id;

COMMIT;


-- @@ revert
-- Reversa. Restaura la fecha original de las filas que siguen con la fecha
-- corregida y borra su respaldo, en una transacción.
BEGIN;

CREATE TABLE IF NOT EXISTS public.epp_equipment_delivery_date_backup (
  id integer PRIMARY KEY,
  original_delivery_date date NOT NULL,
  new_delivery_date date NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

WITH restaurados AS (
  UPDATE public.epp_equipment ee
  SET "deliveryDate" = b.original_delivery_date
  FROM public.epp_equipment_delivery_date_backup b
  WHERE ee.id = b.id
    AND ee."deliveryDate" = b.new_delivery_date
  RETURNING ee.id
)
DELETE FROM public.epp_equipment_delivery_date_backup b
USING restaurados r
WHERE b.id = r.id;

COMMIT;


-- @@ status
-- Estado del respaldo (solo lectura). El comando la ejecuta solo si la tabla
-- de respaldo existe.
SELECT count(*) AS filas_en_respaldo,
       count(*) FILTER (WHERE ee."deliveryDate" = b.new_delivery_date) AS con_fecha_corregida,
       count(*) FILTER (WHERE ee."deliveryDate" = b.original_delivery_date) AS con_fecha_original,
       count(*) FILTER (WHERE ee.id IS NULL) AS fila_ya_no_existe,
       count(*) FILTER (WHERE ee.id IS NOT NULL
                          AND ee."deliveryDate" <> b.new_delivery_date
                          AND ee."deliveryDate" <> b.original_delivery_date) AS con_otra_fecha
FROM public.epp_equipment_delivery_date_backup b
LEFT JOIN public.epp_equipment ee ON ee.id = b.id;
