# Integraciones con brókeres

Único punto de entrada de CRS para hablar con cualquier bróker: `gateway.ts`. Nadie más
(agentes, comité, cartera, interfaz) llama a la API de un proveedor.

```
types.ts      contratos comunes (cuentas, posiciones, órdenes, estados, errores)
adapter.ts    interfaz que implementa cada proveedor
registry.ts   registro central (comprueba que lo declarado = lo implementado)
policy.ts     propiedad de la conexión, permisos, entorno y capacidades (puro, con tests)
gateway.ts    carga la conexión, aplica la política, descifra credenciales, llama al adaptador
              y registra cada orden con clave de idempotencia (broker_orders)
providers.ts  qué adaptadores hay registrados y cuáles se anuncian como «próximamente»
adapters/<id>/  un adaptador por proveedor (hoy: trading212 y binance)
```

## Añadir un bróker

1. Crea `adapters/<id>/` e implementa `BrokerAdapter`: solo los métodos de las capacidades que
   tenga el proveedor, declaradas en `info.capabilities` (el registro rechaza incoherencias).
2. El adaptador se encarga de su autenticación, sus símbolos, sus tipos de orden, sus errores
   (siempre como `BrokerError` normalizado) y sus límites de peticiones.
3. Regístralo en `providers.ts` (y quita su línea de «próximamente»).
4. Añade sus tests con un `fetch` simulado, como `tests/brokers/trading212.test.mjs`.

Nada más cambia: ni el gateway, ni la interfaz de Integraciones, ni los agentes.

## Reglas que no se saltan

- Una conexión es de un usuario y un espacio; el entorno (demo/real) se fija al conectar.
- Permisos que concede el usuario: `read`, `trade` (sus órdenes) y `auto` (automatismos de CRS).
- El entorno real necesita `BROKERS_REAL_ENABLED=true` en el servidor y que el adaptador lo anuncie.
- Las credenciales se cifran con `CONNECTORS_ENCRYPTION_KEY` (lib/connectors/crypto) y nunca salen.
- Una orden se registra antes de enviarse; la misma clave de idempotencia nunca envía dos veces.
  Si el resultado es incierto (`unknown`), se consulta al bróker; no se reenvía.
- En local, el propietario o un administrador puede usar la clave Demo del `.env`
  (`TRADING212_ENV=demo`, `TRADING212_API_KEY`, `TRADING212_API_SECRET`) como una conexión más.
