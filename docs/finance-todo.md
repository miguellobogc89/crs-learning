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

## Mi plan · paquetes (21/11/2026, enfoque vigente)
Se replantea la Planificación para ir paso a paso y construir solo la base. La pantalla Plan arranca vacía con «Crear paquete». Un paquete (Fijos, Tabaco, Restaurantes, Gasolina…) lo define cada usuario con los cargos que marca en un modal con buscador y filtros (cuenta, categoría, solo marcados). Tabla `finance_packages` (nombre + `tx_ids`), migración `20261121140000_finance_packages`.
- [x] Carcasa: crear, renombrar, borrar paquetes y marcar sus cargos (último año, sin traspasos internos).
- [x] Vista por concepto en el modal (selector «Por concepto / Por movimiento» en la cabecera estándar). Marcar un concepto mete sus cargos pasados y futuros aunque cambie el importe (`finance_packages.concept_keys`, migración `20261121150000_finance_package_concepts`); marcar un movimiento mete solo ese cargo. El concepto es `conceptKey` (lib/finance/plan.ts): la clave de comercio sin referencias que cambian en cada pago con tarjeta.
- [x] Cada cargo en un solo paquete (los paquetes reparten el dinero total; el análisis por categorías va aparte). El modal bloquea lo que ya está en otro paquete («En «Fijos»») y el servidor rechaza guardarlo repetido.
- [x] Coste de cada paquete en la lista: este ciclo (con el día del ciclo), ciclo anterior y media de los 3 ciclos completos anteriores; al desplegar, los cargos de este ciclo y si va por encima o por debajo de la media.
- [x] Objetivo por ciclo de cada paquete («Asigna un objetivo», opcional, propuesto con la media de lo marcado; `finance_packages.goal`, migración `20261121160000_finance_package_goal`). En la lista: «X de Y» con barra verde/ámbar/roja según el día del ciclo (los fijos, igual por ahora). Resumen arriba: ingreso medio (del histórico, mismos ciclos que la media), total en objetivos y sin asignar.
- [x] Resumen de Plan (21/11/2026): ingreso medio por ciclo − presupuestado en paquetes − objetivo de ahorro = pendiente de presupuestar. El objetivo de ahorro es el de `finance_settings` (el mismo de la previsión de Inicio, con la misma conversión semanal → ciclo) y se edita desde Plan con el endpoint `settings`; no es un paquete.
- [x] Movimientos patrimoniales fuera de los paquetes: solo entran cargos de tipo «gasto» (comisiones incluidas); traspasos internos no aparecen; las aportaciones a ahorro/inversión se ven en el modal pero bloqueadas; el servidor no los guarda y no cuentan aunque estuvieran asignados (se filtra al calcular). `isPackageCharge` en lib/finance/plan.ts.
- [x] Plan separado en dos (21/11/2026): **Plan** (barra inferior) es seguimiento: gastado en paquetes frente a lo presupuestado, ahorro del ciclo (ingresos ordinarios − gasto real), **gastos sin paquete** (desplegable con sus cargos), una barra por paquete con la raya del día del ciclo y «Qué te está desviando» (`planInsights`, reglas deterministas, máx. 3). **Configurar mi plan** (menú: lateral en Ajustes y grupo «Mi plan» del menú móvil, ruta `/finanzas/configurar`) es la pantalla de paquetes y objetivos de antes, sin cambios.
- Orden acordado (21/11/2026): gastos sin paquete → devoluciones vinculadas a su cargo original (automático con certeza, manual si no; sin vincular = pendiente de conciliación) → medias sin extraordinarios (solo la marca existente, nunca fuera del gasto real) → capacidad de gasto (sin descontar dos veces objetivos de paquetes y recurrentes ya proyectados). Limpieza de endpoints antiguos, después de estabilizar Plan.
- Los ingresos no se configuran: salen del histórico.

## Planificación · la hucha (21/11/2026, primera versión retirada de la pantalla)
La interfaz de esta versión (asistente, partidas, semanas, transferencias, deseos) se ha quitado de la pantalla; la lógica (`lib/finance/plan.ts`) y las columnas siguen y se reaprovecharán si encajan.
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

## Movimientos: detalle a pantalla completa e iconos (22/11/2026)
Inspirado en Fintonic. Filas con icono de color de su categoría (`category-icon.tsx`), punto azul si está por revisar, categoría y fecha debajo. Al tocar un movimiento (Movimientos, móvil y escritorio, y detalle de categoría de Plan) se abre su detalle a pantalla completa desde la derecha (`movement-detail.tsx`, capa sobre la lista: conserva filtros y scroll): importe grande, nombre, fecha, cuenta, categoría y nota; abajo Recategorizar (lista desde abajo, con «aplicar a los parecidos»), Extraordinario (un toque) y ✎ (edición completa).
- Edición en el propio detalle (23/11/2026): sin formulario. Nombre (tocando el título), categoría, subcategoría (con sugerencias de las ya usadas), extraordinario (interruptor fijo), nota y tipo; se guarda al momento en ese movimiento con «Deshacer». Botón abajo «Aplicar a N movimientos más de «X»» solo si hay parecidos distintos de este (en categoría o, si los tiene, nombre/subcategoría); se recalcula tras cada cambio. Sin icono de estrella en la app: extraordinario se indica con texto (`transaction/similar` para contar, `transaction/similar/apply` solo con esos campos —nunca extraordinario ni nota— y crea/actualiza la regla, `transaction/similar/undo`). Se retira el formulario antiguo (EditModal); en escritorio, «Más» abre el mismo detalle.
- Pendiente de lo comparado con Fintonic: pestañas Gastos / Ingresos / No computable en el móvil, agrupar por día dentro del ciclo, «Dividir» un gasto.

## Plan · grupos de categorías (22/11/2026, enfoque vigente)
Sustituye a los paquetes y al laboratorio. Plan = lista de **grupos** (conjuntos de categorías; cada categoría en un solo grupo) con objetivo opcional por ciclo. Tabla `finance_plan_groups` (migración `20261122140000_finance_plan_groups`); `planView` y acciones `plan/group`, `plan/group/categories` (mueve la categoría si estaba en otro grupo) y `plan/group/delete`. La primera vez se crean 4 grupos: Gastos fijos (suministros, suscripciones, préstamos), Ocio (restaurantes, ocio, videojuegos), Moda y complementos (moda) y Comida a domicilio (comida_domicilio).
- Pantalla (móvil primero): líneas finas, desplegable con categorías (gasto del ciclo y diferencia con el anterior a la misma altura), quitar con ×, añadir desde lista que sube desde abajo (buscador, «Sin grupo», «En otros grupos» que se mueven), «Añadir grupo» (nombre + objetivo), línea «Sin grupo». Al volver del detalle queda como se dejó (desplegado y scroll, en la sesión).
- Detalle de categoría `/finanzas/plan/categoria/<clave>`: entra desde la derecha, flecha atrás en la cabecera de la app, historial por ciclos con importe y ciclo fijos arriba que cambian al hacer scroll; editar con la misma ventana que Movimientos (`movement-edit.tsx`).
- Plan exige cuenta conectada con movimientos.
- Categorías nuevas: `moda`, `comida_domicilio`, `mascotas` (palabras clave antes de las genéricas; la IA las recibe en su lista).
- Retirado: «Configurar mi plan», seguimiento por paquetes y laboratorio (las direcciones antiguas redirigen a Plan). `finance_packages` queda en BD sin uso; endpoints antiguos (`packages`, `package*`, `plan/save`, `budget*`) por limpiar.
- Pendiente: renombrar/borrar grupo y cambiar su objetivo desde la pantalla; pulir la parte visual; devoluciones; notificaciones; copiloto con acceso a los grupos.

## Laboratorio de Plan (22/11/2026)
`/finanzas/laboratorio` (fuera de los menús, solo lectura): pantalla para iterar el diseño de Plan con datos reales antes de llevarlo a Plan.
- Grupos = conjuntos de categorías (cada categoría en un solo grupo); lista con líneas finas, desplegable; añadir categorías desde una lista que sube desde abajo (buscador, «Sin partida», «En otras partidas» que se pueden mover); línea «Sin partida».
- Al tocar una categoría: pantalla de detalle que entra desde la derecha (`/finanzas/laboratorio/categoria/<clave>`), con flecha para volver, solo sus movimientos del ciclo; se editan con la misma ventana que Movimientos (`components/finance/movement-edit.tsx`, compartido).
- Moda, Comida a domicilio y Mascotas simuladas por comercio (`lab-categories.ts`) hasta crearlas como categorías reales.
- Pendiente: llamar «Grupos» a las partidas y «Añadir grupo», animaciones de desplegar, objetivos por grupo, cuenta obligatoria antes de Plan.

## Pendiente (23/11/2026, revisión de las hojas)
- Quitar la cabecera de resumen de las hojas de grupo/categoría/extraordinarios (referencia, «lo que más pesa»,
  enlace a Mi plan): no gusta. Repensar después.
- Marcar los extraordinarios en el icono de la fila del movimiento (no solo en el subtítulo, que si es largo no
  se ve).
- En «Tus grupos» de Inicio, al tocar una categoría del desplegable, abrir la hoja del grupo ya filtrada por esa
  categoría (pill marcada).
- (Avanzado, más adelante) Previstos fase 4: enlazar solo el previsto con el cargo del banco (categoría/grupo,
  importe ±30 %, fecha ±5 días), sugerir si hay dudas, «¿Se hizo?» pasada la fecha (efectivo / no se hizo /
  aún no ha llegado) y poder separarlos.
- (Avanzado, más adelante) Gastos compartidos: si pago 60 € en un restaurante y recibo 2 Bizum de 20 € de amigos,
  entender que son su parte e imputar solo 20 € a la cena.
- (UX) «Se repite» en el detalle del movimiento: cambiar «Ya lo he cancelado» por un botón discreto «He cancelado
  esta suscripción» que abra una hoja desde abajo: «¿Has cancelado este gasto mensual?» y abajo «Sí, lo he
  cancelado». Después, en el detalle, en pequeño y gris: «No se repite desde <mes de cancelación>».

- Inicio: más adelante, al final de la lista, una línea con los grupos en los que no has gastado este mes (p. ej. «Sin gastos este mes: Moda y complementos»).

- Movimientos entre tus cuentas (transferencias internas): no deben verse en ningún sitio (listas, hojas, Movimientos). No aportan valor.
- Movimientos sin clasificar: banner en Movimientos («hay N movimientos que no llegamos a entender») con botón a la derecha que filtra la lista (y cambia a «Ocultar»); cada uno con un punto en el icono; en el detalle, la categoría destacada. Quitar el aviso de arriba de Inicio.

- Inicio: rediseñar el gráfico de arriba (al usuario no le gusta cómo se ve). Sin prisa.
