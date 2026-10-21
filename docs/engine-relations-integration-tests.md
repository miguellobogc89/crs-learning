# Engine — pruebas de relaciones en PostgreSQL

## Estado y alcance

- 16 pruebas unitarias de upsert: `node scripts/test-engine-upsert.cjs`
- 15 pruebas unitarias del planificador de relaciones: `node scripts/test-engine-relations.cjs`
- 15 comprobaciones de almacenamiento PostgreSQL: `node scripts/test-engine-relations-db.cjs`

Las pruebas de PostgreSQL comprueban restricciones, integridad referencial, separación por workspace, persistencia y rollback. **No ejercitan todavía el servicio Next.js `reviewEngineRelation`** ni prueban permisos de usuario, la semántica de aprobación o concurrencia. Esas comprobaciones necesitan una suite adicional de servicio con conexión aislada.

## Requisitos de seguridad

1. Crear **otra base PostgreSQL**, nunca usar la base de producción. El nombre debe terminar en `_test` o `_testing` (por ejemplo `crs_engine_test`).
2. Mantener `DATABASE_URL` apuntando al entorno habitual; no cambiarla para ejecutar pruebas.
3. Configurar `ENGINE_TEST_DATABASE_URL` con la URL de la base **aislada**. No copiar esta credencial al repositorio.
4. Aplicar el esquema completo y la migración `20261021120000_engine_record_relations` **solo en la base aislada**. Comprobar previamente el estado del historial de migraciones: no ejecutar `prisma migrate deploy` a ciegas sobre una base vacía si el repositorio no contiene el baseline completo. La suite nunca aplica migraciones.
5. Confirmar que la tabla `engine_record_relations` existe antes de ejecutar la suite.

## Ejecución en PowerShell (en la raíz del repositorio)

```powershell
git pull origin engine
npx prisma validate
npx prisma generate
npx tsc --noEmit
node scripts/test-engine-upsert.cjs
node scripts/test-engine-relations.cjs

# Configurar la URL de una base de pruebas YA PREPARADA.
# La variable debe establecerse solo en esta terminal; no usar DATABASE_URL.
$env:ENGINE_TEST_DATABASE_URL = Read-Host "URL PostgreSQL de la base aislada *_test"
node scripts/test-engine-relations-db.cjs
Remove-Item Env:ENGINE_TEST_DATABASE_URL
```

Si falta la URL, no coincide con el patrón esperado, apunta exactamente a `DATABASE_URL` o la tabla no existe, el programa se detiene sin crear datos.

## Qué esperamos

`15/15 database checks passed` y `Fixture transaction rolled back; no test data committed.`

Los resultados aún **no están verificados** contra una base real; no debe interpretarse que los tests han pasado hasta ejecutar el comando y revisar su salida.

## Pendiente

- Pruebas de servicio de `reviewEngineRelation`: aprobar, rechazar, roles, ACL documental, doble aprobación y concurrencia.
- Probar transacciones con errores forzados en el servicio y confirmar rollback completo.
- Revisar la migración en una base clonada antes de desplegarla en producción.
