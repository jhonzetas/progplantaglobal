# Responsivo para celular (sin afectar tablet/PC)

## Contexto

El kiosko se diseñó y probó solo para tablet/PC. En celular, el texto se
desborda mucho hacia abajo porque la tabla tiene 20 columnas con anchos
en porcentaje (`table-fixed`) — en una pantalla angosta cada columna
queda demasiado estrecha para su contenido, sin importar el tamaño de
letra.

## Objetivo

Que la app se vea y funcione bien en celular, **sin modificar en
absoluto** el comportamiento/apariencia en tablet y PC — que hoy están
"perfectas" según el usuario.

## Alcance (decidido en brainstorming)

- **Breakpoint:** 768px (el breakpoint `md` de Tailwind). Por debajo de
  eso es "móvil"; en 768px o más, todo se comporta exactamente igual a
  hoy.
- **Mecanismo:** todas las clases de Tailwind existentes se dejan
  intactas. Los ajustes para móvil se agregan como clases nuevas con el
  prefijo `max-md:` (aplican solo por debajo de 768px) **junto a** las
  clases actuales, nunca reemplazándolas. Esto es lo que garantiza cero
  impacto en tablet/PC: nada de lo que ya existe se toca.
- **Tabla (la pieza más grande):**
  - Letra más pequeña en móvil.
  - La tabla obtiene un ancho mínimo en píxeles solo en móvil (rompe el
    encogimiento proporcional de `table-fixed`), lo que fuerza scroll
    horizontal real en vez de columnas ilegibles.
  - La columna de MÁQUINA queda fija a la izquierda (`sticky`) mientras
    se desliza el resto horizontalmente, para no perder la referencia
    de a qué máquina pertenece cada fila.
  - El encabezado de columnas sigue fijo arriba (ya lo está hoy) —
    debe seguir funcionando junto con el nuevo scroll horizontal.
- **Header (título/fecha/botones), OBSERVACIONES y BITÁCORA:** ajustes
  de tamaño de texto y espaciado (y, donde haga falta, permitir que los
  elementos se acomoden en más de una línea) para que no se corten ni se
  encimen en pantallas angostas.
- **Login:** ya se construyó responsivo desde el principio (probado en
  375/768/1280px) — no necesita cambios en este trabajo.
- Descartado: ocultar columnas en móvil (el usuario prefirió mantener
  las 20 columnas visibles vía scroll horizontal, no perder ninguna).

## Verificación (crítico dado el requisito de "no tocar tablet/PC")

Cada tarea debe confirmar explícitamente, con capturas o inspección
directa, que en 768px y en anchos de PC (ej. 1280px+) la app se ve
**idéntica** a como se veía antes de este cambio — no solo que móvil se
ve bien.

## Fuera de alcance

Los 3 hallazgos menores ya identificados en revisiones anteriores
(config de ESLint, duplicación de código en `marcar`/`limpiarEstado`,
condición de carrera en marcaciones muy rápidas) y el acotamiento de la
lista de bitácora (`LTRIM`) siguen pendientes, no forman parte de este
trabajo.
