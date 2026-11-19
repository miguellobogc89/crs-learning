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
- [x] **Nóminas personales estructuradas en Neon (19/11/2026):** creadas `finance_payslips`, `finance_payslip_items` y vista `finance_payslip_yearly_totals`; importadas 13 nóminas de octubre de 2025 a octubre de 2026 con 408 conceptos y conciliación matemática verificada, incluyendo anticipos, atrasos, IRPF, SS del trabajador, aportación de la empresa, pagas extra y plan de pensiones. Los PDF no se han añadido al repo. **Pendiente:** integrar lectura en interfaz Finance, sincronizar modelos Prisma y vinculación con ingreso bancario.

### Posicionamiento y validación
- [ ] Diferenciarse por utilidad verificable, experiencia placentera y ejecución adaptada a España. Rocket Money/Rowan ya ofrece IA que detecta cargos, cancela suscripciones y actúa; «tener un agente» no es diferencial en sí mismo.
- [ ] Validar el recorrido banco conectado → hallazgo útil → acción autorizada → beneficio demostrado.
- [ ] No prometer gestiones automáticas ni fiscalidad exacta sin fuente de datos, requisitos regulatorios y controles suficientes.
