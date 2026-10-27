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

Siguiente paso (3): «Sincronizar ahora» → documentos nuevos de la carpeta (sin duplicados por contenido) → importador → se
paran antes de guardar.

## Puesta en marcha

1. Neon: ejecutar `scripts/neon/20261027_workspace_connections.sql` y después `npx prisma generate`.
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

`npm run test:connectors` (sin red: Google se simula).
