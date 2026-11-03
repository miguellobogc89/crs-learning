-- CRS Learning · Catálogo de productos: referencia del proveedor, alias y precio de tarifa
--
-- Añade al catálogo de productos (la tabla del asistente que «Productos comprados» enlaza) tres columnas:
--   referencia     Referencia del proveedor (texto). Se rellena con la más repetida en sus compras.
--   alias          Otras formas en que las facturas escriben el producto (texto largo, separadas por « | »).
--                  Se rellena con las descripciones de sus compras distintas del nombre del producto.
--   precio_tarifa  Precio por envase sin descuento y sin IVA. La app lo calcula en vivo: no se guarda.
-- Solo rellena lo que está vacío: nunca pisa lo que ya haya escrito una persona.
-- Como en el asistente, la versión de la tabla sube y sus filas con ella (siguen editables).
-- Re-ejecutable: si las columnas ya existen, no hace nada.
--
-- Cambia los dos valores de abajo y ejecútalo entero en el SQL Editor de Neon.
BEGIN;

DO $$
DECLARE
  v_ws   uuid := '0fc21801-9c43-4574-a161-6ee52991d7c7';   -- workspace_id
  v_cat  text := 'catalogo_productos';                     -- clave de la tabla catálogo
  v_type uuid;
  v_next int;
  v_max  int;
  v_new  int;
  v_rows int;
BEGIN
  SELECT id, schema_version + 1 INTO v_type, v_next
  FROM engine_object_types WHERE workspace_id = v_ws AND key = v_cat AND status = 'active';
  IF v_type IS NULL THEN RAISE EXCEPTION 'No existe la tabla «%» en ese espacio.', v_cat; END IF;

  SELECT COALESCE(max(sort_order), 0) INTO v_max FROM engine_field_definitions WHERE object_type_id = v_type;

  INSERT INTO engine_field_definitions (workspace_id, object_type_id, key, name, field_type, is_required, sort_order, configuration)
  SELECT v_ws, v_type, f.key, f.name, f.tipo, false, v_max + f.n, f.conf
  FROM (VALUES
    ('referencia',    'Referencia del proveedor', 'text',      1, '{"origen":"asistente","money":false}'::jsonb),
    ('alias',         'Alias',                    'long_text', 2, '{"origen":"asistente","money":false}'::jsonb),
    ('precio_tarifa', 'Precio de tarifa',         'decimal',   3, '{"origen":"asistente","money":true}'::jsonb)
  ) AS f(key, name, tipo, n, conf)
  WHERE NOT EXISTS (SELECT 1 FROM engine_field_definitions d WHERE d.object_type_id = v_type AND d.key = f.key);
  GET DIAGNOSTICS v_new = ROW_COUNT;
  IF v_new = 0 THEN
    RAISE NOTICE 'Las columnas ya existían: no se ha cambiado nada.';
    RETURN;
  END IF;

  UPDATE engine_object_types SET schema_version = v_next, updated_at = now() WHERE id = v_type;

  WITH enlace AS (
    SELECT rd.id
    FROM engine_object_types ot
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ot.settings->'enlaces', '[]'::jsonb)) e
    JOIN engine_relation_definitions rd ON rd.workspace_id = v_ws AND rd.key = e->>'relacion' AND rd.status = 'active'
    WHERE ot.workspace_id = v_ws AND ot.key = 'invoice_line' AND ot.status = 'active' AND e->>'destino' = 'tabla:' || v_cat
  ),
  vinc AS (
    SELECT rc.from_record_id AS cat_id, l.values_json AS v
    FROM engine_record_relations rc
    JOIN engine_records l ON l.id = rc.to_record_id AND l.status <> 'archived'
    WHERE rc.relation_definition_id IN (SELECT id FROM enlace)
  ),
  refs AS (
    SELECT DISTINCT ON (cat_id) cat_id, trim(v->>'product_reference') AS referencia
    FROM vinc WHERE COALESCE(trim(v->>'product_reference'), '') <> ''
    GROUP BY cat_id, trim(v->>'product_reference')
    ORDER BY cat_id, count(*) DESC, trim(v->>'product_reference')
  ),
  descr AS (
    SELECT cat_id, array_agg(DISTINCT regexp_replace(trim(v->>'description'), '\s+', ' ', 'g')) AS d
    FROM vinc WHERE COALESCE(trim(v->>'description'), '') <> '' GROUP BY cat_id
  ),
  nuevos AS (
    SELECT c.id,
      CASE WHEN COALESCE(c.values_json->>'referencia', '') = '' AND r.referencia IS NOT NULL
           THEN jsonb_build_object('referencia', r.referencia) ELSE '{}'::jsonb END
      ||
      CASE WHEN COALESCE(c.values_json->>'alias', '') = '' THEN COALESCE((
        SELECT jsonb_build_object('alias', string_agg(x, ' | ' ORDER BY x))
        FROM unnest(a.d) x
        WHERE lower(x) <> lower(regexp_replace(trim(COALESCE(c.values_json->>'producto', '')), '\s+', ' ', 'g'))
        HAVING count(*) > 0), '{}'::jsonb) ELSE '{}'::jsonb END AS extra
    FROM engine_records c
    LEFT JOIN refs r ON r.cat_id = c.id
    LEFT JOIN descr a ON a.cat_id = c.id
    WHERE c.workspace_id = v_ws AND c.object_type_id = v_type
  )
  UPDATE engine_records c
  SET values_json    = c.values_json || n.extra,
      schema_version = v_next,
      revision       = c.revision + 1,
      updated_at     = now()
  FROM nuevos n
  WHERE c.id = n.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RAISE NOTICE 'Columnas añadidas: %. Filas del catálogo actualizadas: %.', v_new, v_rows;
END $$;

-- Resultado: cuántos productos han quedado con referencia y con alias
SELECT count(*)                                                  AS productos,
       count(*) FILTER (WHERE COALESCE(values_json->>'referencia', '') <> '') AS con_referencia,
       count(*) FILTER (WHERE COALESCE(values_json->>'alias', '') <> '')      AS con_alias
FROM engine_records r
JOIN engine_object_types ot ON ot.id = r.object_type_id
WHERE ot.workspace_id = '0fc21801-9c43-4574-a161-6ee52991d7c7' AND ot.key = 'catalogo_productos' AND r.status <> 'archived';

COMMIT;
