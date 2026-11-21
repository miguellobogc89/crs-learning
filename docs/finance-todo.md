# Finance: pendientes

Ideas y tareas del módulo de finanzas personales. Recopilación de conversaciones hasta el 19/11/2026; antes de implementar, comprobar el estado real en código y BD. No repetir tareas terminadas.

## Prioridad: datos y conexiones
- [ ] Investigar la opción más económica y viable para que otros usuarios conecten sus propias cuentas bancarias desde CRS Finance (proveedores de open banking, tarifas por usuario/cuenta, requisitos regulatorios y escalabilidad). Actualmente existe integración con Enable Banking, pero está habilitada solo para el propietario; no plantear la conexión bancaria como funcionalidad inexistente.
- [ ] Consolidar movimientos y extractos bancarios sin duplicados, con histórico incremental y conciliación.
- [ ] Revisar detección de suscripciones y cargos recurrentes, anomalías y aumentos de precio.
- [ ] Aprovechar la conexión Gmail para identificar recibos y facturas relevantes, sin mezclarla con la sección Cuentas.

## Análisis y planificación
- [ ] Aprendizaje de correcciones de categorías y reglas de clasificación de movimientos.
- [ ] Presupuestos, objetivos de ahorro y proyección de liquidez, respetando el ciclo de ingresos/gastos configurado (p. ej. del 25 al 24).
- [ ] Asistente conversacional que explique gastos, tendencias y decisiones financieras a partir de los datos del usuario.
- [ ] Valorar integración con CRS Trade para una visión patrimonial conjunta sin duplicar saldos.

## Nóminas y fiscalidad
- [ ] Permitir subir nóminas (PDF o imagen), extraer conceptos y vincular el neto con el ingreso bancario correspondiente.
- [ ] Ayudar a preparar la declaración de la renta: organizar documentos, estimar retenciones/IRPF y señalar posibles deducciones para revisión, sin presentar estimaciones como asesoramiento fiscal definitivo.

## Producto
- [ ] Validar precio y coste por usuario para un primer mes de prueba y posterior suscripción; comprobar el coste real de conectar varias cuentas.

> Ya tratado como implementado en conversaciones recientes: categoría «Videojuegos», agrupación de movimientos por categoría y orden alfabético de categorías en selectores. Verificar en código si se revisa de nuevo.

## Visión de producto y UX (decisión 19/11/2026)
- **Objetivo:** crear una app a la que el usuario quiera entrar todos los días porque le gusta, con utilidad real en segundo plano. No un «Fintonic con IA», ni una experiencia centrada en reprochar gastos, clasificar movimientos o interpretar dashboards.
- **Promesa:** «Protege mi dinero», «Anticipa mi futuro» y «Ayúdame a disfrutarlo». Notificar oportunidades concretas y ofrecer acciones fáciles, positivas, con pocas interrupciones.
- **Principio de fricción:** la conexión bancaria inicial debe aportar valor por sí sola. Nóminas y facturas son fuentes de datos opcionales; estudiar conectores con permiso del usuario para evitar subir documentos repetidamente.
- **Medir valor real:** un marcador de ahorro efectivo y dinero recuperado comprobado; diferenciar de estimaciones y oportunidades pendientes. Mostrar incertidumbre y pedir confirmación en inferencias.

### Ideas de producto pendientes
- [ ] **Dinero recuperable / defensor del usuario:** detectar posibles cobros duplicados, renovaciones, aumentos anómalos y suscripciones; aportar pruebas, facilitar reclamaciones o devoluciones, siempre con revisión y autorización del usuario.
- [ ] **Dinero disponible de verdad:** saldo utilizable hasta el siguiente ingreso, descontando pagos previsibles y colchón de seguridad; simulador de escapadas, compras y decisiones sin culpa ni obligaciones de presupuesto.
- [ ] **Facturas que se revisan solas:** investigar acceso autorizado a consumo eléctrico mediante Datadis y contraste con comparador CNMC; sin foto mensual. La tarifa actual y las condiciones contractuales hacen falta para estimar ahorros fiables. Explorar telefonía y seguros con sus propias limitaciones.
- [ ] **Defensor de compras / poscompra:** precio después de comprar, ventanas de devolución, garantías, incidencias y reclamaciones. Requiere identificar el producto (correo de compra autorizado o enlace compartido); el banco no conoce el artículo.
- [ ] **Acompañamiento ante cambios vitales:** detectar cambios significativos de ingresos y pagos (empleo, alquiler, guardería, hipoteca) y ofrecer recalcular planes sin asumir la causa automáticamente.
- [ ] **Finanzas en pareja con privacidad:** objetivos y aportaciones conjuntas sin compartir el detalle de los movimientos personales; permisos explícitos.
- [ ] **Lista de deseos inteligente:** vigilar precios donde haya fuente fiable y conectar el momento de compra con la disponibilidad real y los planes financieros.
- [x] **Nóminas personales estructuradas en Neon (19/11/2026):** creadas `finance_payslips`, `finance_payslip_items` y vista `finance_payslip_yearly_totals`; importadas 13 nóminas de octubre de 2025 a octubre de 2026 con 408 conceptos y conciliación matemática verificada, incluyendo anticipos, atrasos, IRPF, SS del trabajador, aportación de la empresa, pagas extra y plan de pensiones. Los PDF no se han añadido al repo. **Interfaz lista (19/11/2026):** apartado `Documentos` de Finance, con selector `Nóminas`, última nómina, histórico desplegable, barras de conceptos y comprobación aritmética; lectura de Neon limitada al usuario autenticado. **Pendiente:** sincronizar modelos Prisma (actualmente la lectura usa SQL parametrizado) y vincular con movimientos bancarios.

### Posicionamiento y validación
- [ ] Diferenciarse por utilidad verificable, experiencia placentera y ejecución adaptada a España. Rocket Money/Rowan ya ofrece IA que detecta cargos, cancela suscripciones y actúa; «tener un agente» no es diferencial en sí mismo.
- [ ] Validar el recorrido banco conectado → hallazgo útil → acción autorizada → beneficio demostrado.
- [ ] No prometer gestiones automáticas ni fiscalidad exacta sin fuente de datos, requisitos regulatorios y controles suficientes.

## Planificación · la hucha (21/11/2026)
Objetivo: que cualquier usuario monte su plan del ciclo como lo hacía el propietario con ChatGPT: ahorro objetivo, gastos fijos reales, partidas variables (p. ej. ocio) con la cuenta que paga cada una, seguimiento semanal, avisos y lista de deseos. Nada a medida: partidas, importes, categorías y cuentas los decide cada usuario.

Decisiones:
- El gasto de una partida se mide **por categoría**, no por tarjeta (un taxi pagado con otra cuenta cuenta igual). La cuenta solo ayuda: la partida muestra los movimientos sin clasificar de su cuenta para clasificarlos.
- **Sin arrastres manuales:** el límite semanal es lo que queda de la partida repartido entre los días que faltan del ciclo; lo que sobra se reparte en las semanas siguientes y lo que te pasas se descuenta. El dinero no gastado sigue en las cuentas (foto de saldos) como disponible hasta que el usuario lo mande a ahorro o a un deseo.

Estado:
- [x] **F1 · Plan del ciclo** (migración `20261121120000_finance_planning`, aplicada en Neon): partidas con tipo fijo/variable y cuenta que las paga; ingreso esperado (o detectado: mediana de los últimos ciclos), cuenta de cobro (o detectada) y cuenta de ahorro en `finance_settings`; tarjeta «Tu plan del ciclo» con el cuadre (ingreso − fijos − variables − ahorro = sin asignar; sin partidas fijas usa los recibos detectados) y las transferencias del día de cobro por cuenta, descontando lo ya movido. Lógica en `lib/finance/plan.ts` con tests en `tests/finance/plan.test.mjs`.
- [x] **F3 · Semana** (adelantada): cada partida variable muestra la semana actual (gastado/límite/queda) y la tira de semanas del ciclo (lunes a domingo, recortadas al ciclo; futuras «previstas»).
- [x] **F5 · Lista de deseos** (`finance_wishlist_items`): precio, apartado, prioridad, enlace, «comprado»; marca «te lo puedes permitir ya» con lo disponible sin tocar el ahorro (`projection.safeToSpend`).
- [x] **Asistente «Configurar plan» (21/11/2026):** separa configurar de seguir. Cinco pasos: ingreso (detectado, editable) y cuenta de cobro → ahorro y su cuenta → gastos fijos (recibos detectados que se marcan; una partida fija por cuenta que los paga, recordados en `finance_budgets.recurring_keys`, migración `20261121130000_finance_plan_recurring`) → partidas variables (cada categoría solo en una partida, para no contar dos veces) → resumen con cuadre y transferencias. Se guarda todo de una vez (`plan/save`). La pantalla Plan queda solo para seguimiento.
- [x] **Extraordinarios fuera de las partidas:** los movimientos marcados como extraordinarios (IBI, averías…) ya no cuentan en la partida ni en la semana. Cada partida lista sus movimientos del ciclo con el botón «Extraordinario / Contar».
- [x] Partida agotada: en vez de límites semanales a 0 €, avisa de cuánto te has pasado en el ciclo.
- [ ] **F4 · Notificaciones push** (reutilizar la PWA y el push de Trading): 80 % y 100 % del límite semanal, sobrante del domingo («¿a deseos o al ahorro?»), resumen del lunes y recordatorio de transferencias el día de cobro. Umbrales configurables.
- [ ] Mandar el sobrante de la semana a un deseo con un toque (sumar a «apartado»).
- [ ] Resumen al cierre del ciclo (plan frente a real y saldos finales) guardado como foto.
- [ ] **F6 · IA crítica** sobre el plan: subidas de fijos, ritmo que no llega al ahorro, etc.
- [ ] Sincronizar `finance_wishlist_items` y las nuevas columnas si se regenera el esquema con `prisma db pull` (las FK a `finance_accounts` existen en BD pero no como relación Prisma).
