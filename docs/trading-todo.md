# Trading: pendiente (To Do)

Apuntado el 10/11/2026. Sin empezar.

## Universo
- [ ] Ampliar crypto a ~25 monedas.
- [ ] Reuniones de los agentes también en fin de semana (solo pueden operar crypto).
- [ ] Añadir EE. UU.: 30-50 empresas más grandes y conocidas.
  - [ ] Mover cotizaciones y reuniones a ~22:30 (Madrid), después del cierre de Wall Street.
  - [ ] Convertir dólares a euros con el cambio del día y enseñar el efecto divisa.
  - [ ] Fuentes de noticias de EE. UU.

## Agentes estándar para todos
- [x] Los agentes son globales, no por espacio de trabajo: mismo historial para todo el mundo y un espacio nuevo no los reinicia.
  - Coste de IA fijo (3 reuniones al día en total, no 3 por espacio).

## Abrir cuenta
- [x] Al entrar por primera vez no se crea una cartera de 10.000 €: aparece «Abrir cuenta» y el usuario elige el capital inicial (rango 500 € - 100.000 €).
- [x] Comisiones por defecto como un bróker sin comisiones (si no, con 500 € el mínimo de 3 € distorsiona).

## Copiar a un agente (copy trading)
- [x] Asignar a cada agente un peso: % del capital que replica (la suma no pasa del 100 %; el resto queda para operar a mano).
- [x] Réplica proporcional: si el agente mete el 25 % de su cartera en Repsol, tú metes el 25 % de la parte asignada.
- [x] Una subcartera por agente seguido (resultado separado por agente y sin conflictos si dos compran lo mismo).
- [x] Al empezar a seguir: solo operaciones nuevas, con opción de «igualar su cartera actual».
- [x] Copiar automáticamente (virtual).
- [ ] Avisar y ejecutar con un botón (dinero real).
- [x] Permitir fracciones de acción en las copias (con poco capital no salen acciones enteras).

## Que se sienta viva
- [ ] Precios durante el día (crypto en tiempo real, bolsa con ~15 min de retraso).
- [ ] Avisos de movimientos de los agentes (y más adelante WhatsApp).
- [ ] Liga semanal entre usuarios y agentes.

## Dinero real (más adelante)
- [ ] Reactivar Trading 212 (NEXT_PUBLIC_TRADING212_UI) y conectar la copia con la ejecución protegida.
- [ ] Revisar el programa de referidos de Trading 212.

## UX (12/11/2026)
- [ ] Quitar la sección «Reglas y riesgo»: aquí se opera por copia (sin ajustes de riesgo propios ni modo automático por figuras).
- [ ] Nueva sección «Mercados» (debajo de Mi cartera) que unifica Valores seguidos, Gráficos, Noticias y Aprende, con pestañas horizontales: Valores (lista; al pulsar, su gráfico), Noticias y Aprende. Cada pestaña con su URL (`/trading/mercados?tab=…`); en móvil, fila desplazable.

## Agentes (12/11/2026)
- [x] Página propia de cada agente (`/trading/agentes/<clave>`, miga «Inicio > X» o «Agentes > X»).
- [x] Tarjetas con menú de tres puntos, puesto junto al nombre y estado de tus copias.
- [ ] Pausar / reanudar agente (en el menú como «Pronto»).
- [ ] Duplicar agente y crear agente de verdad (el formulario ya está, sin guardar).
- [ ] Eliminar (solo agentes de usuarios).
- [ ] Páginas de usuarios con cartera pública (p. ej. Paco_Gomez), solo si el usuario la hace pública.
