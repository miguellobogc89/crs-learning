# Finance: pendientes

Ideas y tareas del módulo de finanzas personales. Recopilación de conversaciones hasta el 19/11/2026; antes de implementar, comprobar el estado real en código y BD. No repetir tareas terminadas.

## Prioridad: datos y conexiones
- [ ] Evaluar conexión bancaria de solo lectura para importar movimientos y saldos, con varias cuentas por usuario y coste de agregación controlado.
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
