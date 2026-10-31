# WhatsApp en CRS Learning

Adaptación del módulo de `Crussader/main` a `crs-learning/dev`. Entrada: `/whatsapp` (redirige a `/whatsapp/contacts`). Menú lateral: **Contactos** (consola de prospectos importados por CSV), **Conversaciones** (chat) y **Configuración › Números / Plantillas**. `/whatsapp/leads` redirige a Contactos.

## Instalación

1. Aplicar **únicamente** la migración aditiva `prisma/migrations/20261030080000_whatsapp/migration.sql` sobre la base de datos de CRS Learning, dentro de una transacción. Por ejemplo:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f prisma/migrations/20261030080000_whatsapp/migration.sql
   ```

   Después, la migración aditiva de contactos y envíos masivos, igual: `prisma/migrations/20261031100000_whatsapp_contacts/migration.sql` (cuatro tablas nuevas, sin tocar datos existentes).

   El repositorio tiene un historial parcial de migraciones; no ejecutar `migrate reset` ni aplicar todas las migraciones a una base existente. La migración nueva crea cuatro tablas y sus índices/FKs; no modifica datos anteriores. No se ha aplicado a una base remota desde esta implementación.

2. Configurar las variables del servidor:

   | Variable | Uso |
   | --- | --- |
   | `META_APP_ID` | Aplicación de Meta que tiene WhatsApp Cloud API |
   | `META_APP_SECRET` | Canje de autorización y validación de firmas del webhook |
   | `META_WHATSAPP_CONFIG_ID` | Configuración de Facebook Login for Business / WhatsApp Embedded Signup, flujo estándar con número |
   | `META_GRAPH_VERSION` | Versión de Graph API; por defecto `v24.0`, debe estar habilitada en la aplicación |
   | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secreto de verificación elegido para el webhook de esta aplicación |
   | `CONNECTORS_ENCRYPTION_KEY` | Clave AES de 32 bytes en base64, la misma utilizada por los conectores existentes. Conservarla; cambiarla invalida las credenciales guardadas |
   | `META_WHATSAPP_REDIRECT_URI` | Solo si la configuración de Meta exige enviar una URI durante el canje; debe coincidir con la autorización |

   No copiar `WHATSAPP_PERMANENT_TOKEN` de Crussader: cada número usa la credencial concedida por su alta en este espacio de trabajo.

3. En Meta, autorizar el dominio de CRS Learning, configurar Facebook Login for Business y los permisos `whatsapp_business_management` y `whatsapp_business_messaging`. El flujo usa la configuración de Embedded Signup sin parámetros legacy de versión de sesión. Completar la verificación/registro del número de Cloud API en Meta antes de usarlo para mensajes. No se cambia el PIN ni se migra un número de otra plataforma automáticamente.

4. Configurar el webhook HTTPS `https://<dominio-crs>/api/webhooks/whatsapp`, con el mismo verify token, y suscribir el campo `messages`. La app se suscribe al WABA al conectar un número. Esta URL debe ser pública para Meta y no estar bloqueada por protección de despliegue.

5. Ejecutar `npm ci` y `npm run build`; el build genera Prisma. Entrar como propietario o administrador del espacio y usar **Configuración → Añadir número**. Sincronizar las plantillas del número. Enviar primero una plantilla a un destinatario de prueba autorizado, responder desde ese teléfono y comprobar mensaje entrante, estados e historial.

El estado «Conectado» significa que Meta autorizó el número y se guardaron sus credenciales; la interfaz no presenta esto como una verificación de entrega. La configuración de Meta y el ciclo real de envío/recepción requieren probarse con credenciales del nuevo entorno.

## Organización

- `components/whatsapp/`: interfaz, navegación, chat, plantillas, configuración y adaptador del SDK de Facebook.
- `lib/whatsapp/meta.ts`: único cliente de Graph API, con límite de tiempo y errores sin secretos.
- `lib/whatsapp/repository.ts`: búsquedas obligatoriamente limitadas al espacio activo.
- `lib/whatsapp/service.ts`: conexión, sincronización/creación de plantillas y envío.
- `lib/whatsapp/webhook.ts`: persistencia de entrantes y estados; sin agentes automáticos ni dependencias de citas.
- `lib/whatsapp/rules.ts`: validación, ventana de atención, firma y orden de estados.
- `app/api/whatsapp/[...action]/route.ts`: sesión, permisos, origen y despacho de operaciones.
- `lib/connectors/context.ts`: contexto de sesión y espacio compartido con Drive; se conserva la exportación anterior de Drive para no romper consumidores.

## Comportamiento

- Múltiples números por espacio, con historial independiente. Un número no puede pertenecer simultáneamente a dos espacios. FKs compuestas evitan relaciones entre espacios incluso fuera de la API.
- Solo propietarios/administradores conectan, desconectan, crean y sincronizan plantillas. Los miembros pueden usar chat y favoritas. El cliente no elige el workspace y nunca recibe tokens.
- Canje inmediato del código, contexto temporal cifrado y cookie HttpOnly ligada a usuario/espacio; el evento de sesión y el código pueden llegar en cualquier orden. Se validan los orígenes del evento de Facebook.
- Chat con búsqueda, no leídos, historial paginado, refresco periódico, estados y conversaciones nuevas mediante plantilla aprobada. Texto libre solo durante 24 horas desde el último mensaje entrante (validado en servidor).
- Cada envío reserva un UUID antes de llamar a Meta; una repetición de esa petición devuelve el mismo resultado. Un timeout queda como «Sin confirmar» y no se reintenta automáticamente. El borrador conserva el UUID al reintentar sin editarlo. Los webhooks correlacionan el UUID del mensaje mediante `biz_opaque_callback_data`.
- Firma HMAC sobre el cuerpo original del webhook; IDs únicos evitan mensajes/no leídos duplicados; los estados no retroceden si llegan desordenados. Un fallo de persistencia devuelve 500 para permitir reintento de Meta.
- Plantillas: sincronización paginada con Meta, búsqueda y filtros por estado/categoría/idioma, favoritas y vista previa. Creación de plantillas de texto de utilidad o marketing con variables numéricas y ejemplos. Chat envía plantillas aprobadas de cuerpo/pie de texto; plantillas multimedia/con botones siguen visibles pero requieren ampliar el compositor antes de enviarlas.
- Adjuntos entrantes muestran tipo y texto/caption cuando existe; no se descargan ni se envían adjuntos. No se importa el historial ni la base de datos de Crussader. Desconectar borra el token local y conserva el historial; no revoca una suscripción WABA compartida con otros números.

## Contactos y envíos masivos

- **Importar CSV** (máx. 4 MB / 20.000 filas): el navegador lee el archivo, detecta las columnas por su nombre (Empresa, Categoría, Especialidad, Localidad, Provincia, Teléfono móvil, WhatsApp confirmado, Estrellas, Clasificación, Google Maps, Autorización, Fuente del permiso, Fecha de autorización, No contactar, Seguimiento…) y deja corregir la asignación antes de importar. Todas las columnas originales se guardan en `attributes` y se pueden usar como variables de plantilla.
- Teléfono de WhatsApp: «WhatsApp confirmado» (incluidos enlaces `wa.me/…`) y, si falta, el móvil; números de 9 cifras sin prefijo se consideran españoles (+34). El fijo no se usa para WhatsApp.
- Identidad para reimportar: ficha de Google Maps; si no hay, teléfono; si no, nombre + localidad. Reimportar actualiza los datos descriptivos pero no deshace «No contactar», la autorización ni un seguimiento avanzado en la app. Se avisa de teléfonos compartidos entre fichas (comparten conversación).
- Consola: búsqueda, filtros por categoría, especialidad, provincia, localidad, clasificación, seguimiento, WhatsApp, autorización y estado de contacto; orden por empresa, localidad, estrellas o último envío; selección por página o de toda la lista filtrada; cambio de seguimiento, «No contactar» y borrado (admin) en bloque. La ficha lateral muestra datos, enlaces, notas, plantillas enviadas y la conversación de WhatsApp del contacto.
- **Enviar plantilla** a la selección: cada variable `{{n}}` se toma de un campo del contacto, de una columna del CSV o de un texto fijo. Nunca se envía a contactos sin WhatsApp, con «No contactar», con clasificación o seguimiento «Descartado», ni dos veces al mismo teléfono en una tanda; por defecto tampoco a los ya contactados. Máximo 250 envíos por tanda. Si hay destinatarios sin autorización registrada, el servidor exige confirmación explícita (409 sin ella).
- El envío se procesa por lotes desde el navegador (`campaigns/run`), con progreso, pausa y reanudación. Cada destinatario reserva su UUID como `requestId` del mensaje, así que una repetición o un lote interrumpido nunca envía dos veces. Rechazo de Meta = «Error»; respuesta perdida = «Sin confirmar» (no se reintenta).
- Seguimiento automático: un envío correcto pasa «Sin contactar» → «Contactado»; una respuesta entrante pasa a «Respondió» y registra la fecha; responder BAJA/STOP marca «No contactar».

## Validación

`npm run test:whatsapp` cubre lectura del CSV, detección de columnas, normalización de teléfonos, reimportación, planificación y ejecución de envíos masivos, bajas por respuesta, firma, aislamiento, permisos, ventana de 24 horas, correlación/duplicados, fallos ambiguos y orden de callbacks de Meta. Ejecutar también `npm run test:connectors`, TypeScript y ESLint de los archivos del módulo.

Se ha probado adicionalmente el SQL nuevo en PostgreSQL embebido aislado, incluyendo FKs entre espacios, unicidad de mensajes y borrado en cascada. Ningún test envía mensajes reales ni altera conexiones externas.
