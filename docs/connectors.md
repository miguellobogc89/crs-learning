# Conectores

Sección `/connectors` (menú «Conectores»). Una conexión por espacio de trabajo y proveedor (tabla `workspace_connections`).
Solo el propietario o un administrador del espacio de trabajo conecta, desconecta o elige carpeta; el resto ve el estado.

## Google Drive (pasos 1 y 2)

1. **Conectar**: `GET /api/connectors/google-drive/connect` abre el consentimiento de Google (código + PKCE, `access_type=offline`,
   `prompt=consent`). Estado, verificador PKCE, usuario y espacio de trabajo viajan en una cookie cifrada de 10 minutos.
2. **Vuelta**: `GET /api/connectors/google-drive/callback` comprueba el estado, el usuario y el espacio de trabajo, canjea el código,
   exige el permiso `drive.readonly` y guarda la cuenta y los tokens **cifrados** (AES-256-GCM).
3. **Carpeta**: `GET /api/connectors/google-drive/folders?parent=root|shared|<id>&q=` lista carpetas;
   `PUT /api/connectors/google-drive/folder {id}` la comprueba en Drive y la guarda en `settings_json.folder`;
   `GET …/folder` dice cuántos documentos legibles (PDF e imágenes) tiene.
4. **Desconectar**: `DELETE /api/connectors/google-drive` revoca el permiso en Google (si responde) y borra la conexión.
   Lo ya importado no se toca.

El token de acceso se renueva solo. Si Google lo retira (revocado, o los 7 días de una app en modo «Testing»), la conexión
pasa a «Hay que reconectar».

Es un permiso aparte del inicio de sesión con Google: conectar o desconectar Drive no cambia la sesión.

## Sincronizar (paso 3)

`POST /api/connectors/google-drive/sync {limit?}` (10 por defecto, máximo 50) — `lib/connectors/google-drive/sync.ts`:

1. Un candado en la conexión (`settings_json.syncLeaseUntil`, 5 min) impide dos sincronizaciones a la vez.
2. Lista los PDF e imágenes de la carpeta, **más recientes primero**, y descarta los ya vistos (`connector_synced_files`,
   salvo que su contenido haya cambiado en Drive).
3. Descarga uno a uno (máximo 40 descargas por vez) y calcula el SHA-256. Si ese contenido ya está en cualquier lote del
   espacio de trabajo (subido a mano o de Drive) → `duplicado`. Los archivos de más de 20 MB o que no se pueden descargar → `omitido`.
4. Con los nuevos crea **un** lote de importación (`createIntakeBatch`, el mismo que la subida manual, que ahora guarda
   el `content_hash` de cada archivo). Los lotes antiguos sin huella se calculan una vez.
5. Registra cada archivo mirado (`importado` con su lote y archivo, `duplicado`, `omitido` con el motivo): nunca se vuelve a descargar.
6. La tarjeta abre el lote en la ventana de importación, que avanza sola hasta «Guardar en mis datos» y espera a la persona.

`GET …/sync` dice cuántos documentos faltan por traer (sin descargar nada).

## Puesta en marcha

1. Neon: ejecutar `scripts/neon/20261027_workspace_connections.sql` y `scripts/neon/20261027_connector_synced_files.sql`;
   después `npx prisma generate` (con el servidor parado en Windows).
2. Google Cloud Console (proyecto del ID de cliente):
   - Activar **Google Drive API**.
   - Credenciales → el cliente OAuth → URI de redirección autorizada:
     `http://localhost:3000/api/connectors/google-drive/callback` (y la de producción cuando toque).
   - Pantalla de consentimiento: añadir el ámbito `…/auth/drive.readonly` y, en modo «Testing», los usuarios de prueba.
3. `.env` (nunca en el código):
   ```
   GOOGLE_DRIVE_CLIENT_ID=...
   GOOGLE_DRIVE_CLIENT_SECRET=...
   CONNECTORS_ENCRYPTION_KEY=...   # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Si no se ponen los dos primeros, se usan `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET` (el mismo cliente del login).
   `GOOGLE_DRIVE_REDIRECT_URI` es opcional (por defecto: origen de la petición + ruta de callback).
   **Si se cambia `CONNECTORS_ENCRYPTION_KEY`, las conexiones guardadas dejan de valer y hay que reconectar.**

## Producción

`drive.readonly` es un ámbito restringido: para usuarios fuera de la lista de prueba Google exige verificar la app
(y una evaluación de seguridad). Mientras tanto, modo «Testing» con usuarios de prueba.

## Tests

`npm run test:connectors` (sin red: Google, el almacenamiento y la base de datos se simulan).
