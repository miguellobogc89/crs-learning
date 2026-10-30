# WhatsApp en CRS Learning

Adaptación del módulo de `Crussader/main` a `crs-learning/dev`. Entrada: `/whatsapp` (redirige a `/whatsapp/chat`). Chat, Plantillas, Configuración y Leads; Leads se mantiene vacía.

## Instalación

1. Aplicar **únicamente** la migración aditiva `prisma/migrations/20261030080000_whatsapp/migration.sql` sobre la base de datos de CRS Learning, dentro de una transacción. Por ejemplo:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f prisma/migrations/20261030080000_whatsapp/migration.sql
   ```

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

## Validación

`npm run test:whatsapp` cubre firma, aislamiento, permisos, ventana de 24 horas, correlación/duplicados, fallos ambiguos y orden de callbacks de Meta. Ejecutar también `npm run test:connectors`, TypeScript y ESLint de los archivos del módulo.

Se ha probado adicionalmente el SQL nuevo en PostgreSQL embebido aislado, incluyendo FKs entre espacios, unicidad de mensajes y borrado en cascada. Ningún test envía mensajes reales ni altera conexiones externas.
