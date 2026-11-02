# Auditoría ICLUD Metabuscador — Resumen

Revisión completa de `tomibande/metaabuscador` (commit `12bd75f`, rama `main`).
**No se modificó ni una línea de código.** Esto son informes; vos decidís qué aplicar.

## Estado general

El proyecto está **sano y bien hecho**. Puntos fuertes reales, no de cortesía:

- **Validación en el servidor de verdad.** `src/lib/validar.js` rechaza lo inválido antes de gastar
  una llamada paga a SerpApi. Es la decisión correcta y está bien ejecutada.
- **No se confía en la IA ni en la API externa.** `serpapi.js:34-43` descarta propiedades sin tarifa
  comprobable en lugar de inventar un precio. Eso es lo que separa un metabuscador de un adorno.
- **Secretos del lado del servidor.** `SERPAPI_API_KEY` y `JWT_SECRET` nunca llegan al navegador.
- **Cookie de sesión `httpOnly` + `sameSite: lax`.** El JS del navegador no puede robar el token, y
  `lax` ya te cubre el CSRF en los POST. Mejor que lo que se ve en la mayoría de proyectos de cursada.
- **Enlaces saneados en los dos lados** (`cliente.js:12`, `serpapi.js:3`): solo `http(s)`, nunca `javascript:`.
- **30/30 tests pasan**, y los 85 renglones de `globals.css` cubren todas las clases que usan los componentes.
  Verificado: no falta ningún estilo.

No encontré ningún error que rompa la aplicación ni ninguna falla de seguridad grave.

Eso sí: **el 2026-12-01 se te pone un test en rojo solo** (B17), y falta un archivo que el propio
README te manda copiar (B5). Son los dos arreglos más baratos y los pondría primero.

## Lo que sí encontré

| # | Hallazgo | Gravedad | Archivo |
|---|---|---|---|
| B1 | **No se puede buscar para hoy.** El formulario lo permite, el servidor lo rechaza con un mensaje que no explica nada | Alta | `01-ERRORES.md` |
| B2 | **Los favoritos se duplican.** El mismo hotel guardado con otras fechas entra como favorito nuevo, y el corazón deja de marcarse | Alta | `02-FAVORITOS.md` |
| B5 | **Falta `.env.example`** aunque el README manda copiarlo. Un clon nuevo no puede seguir sus propias instrucciones | Alta | `01-ERRORES.md` |
| B17 | **Los tests dejan de pasar el 2026-12-01.** Hay una fecha fija en `validar.test.js:10` que queda en el pasado | Alta | `01-ERRORES.md` |
| B3 | Si la sesión vence, guardar un favorito muere en un `alert()` sin salida | Media | `02-FAVORITOS.md` |
| B6 | **Código muerto:** Tavily, Gemini y `filtrar.js` ya no los usa nadie, pero siguen con tests y en la descripción del `package.json` | Media | `01-ERRORES.md` |
| B11 | El favorito guarda el precio **sin moneda ni fechas**: un número sin contexto | Media | `02-FAVORITOS.md` |
| B4, B7–B16 | Diez detalles menores (UX, consistencia, enumeración de usuarios, rate limit, prolijidad) | Baja | `01-ERRORES.md` |

Los dos de arriba (B1 y B2) son los que **se van a notar en una demo en vivo**. Los priorizaría.

## Los archivos de esta auditoría

| Archivo | Qué hay adentro |
|---|---|
| `00-RESUMEN.md` | Esto |
| `01-ERRORES.md` | Los 16 hallazgos, uno por uno, con archivo:línea y cómo reproducirlos |
| `02-FAVORITOS.md` | El análisis a fondo de "me gusta" + 15 funciones para añadir, priorizadas |
| `03-PARCHES.md` | Parches listos para pegar, de los seguros a los que piden migración |
| `04-DEFENSA.md` | Preguntas que te van a hacer en la evaluación y cómo responderlas |

## Si solo tenés una tarde

Por orden de impacto sobre esfuerzo:

1. **B5** — crear `.env.example` (2 minutos, y sin esto no arranca un clon nuevo)
2. **B17** — cambiar una fecha fija en un test (1 minuto, y te ahorra un test rojo en diciembre)
3. **B1** — comparar contra medianoche de hoy, no contra `Date.now()` (una línea)
4. **B3** — detectar el 401 y reabrir el login (tres líneas)
5. **B2** — identidad estable del favorito (es el único que pide pensar un rato)
6. Del resto, lo de `02-FAVORITOS.md`: **feedback optimista** y **contador en la pestaña** son muy baratos y se ven.

Los puntos 1 y 2 juntos son menos de cinco minutos y son los dos que, si no los tocás, se van a ver
mal en una entrega de diciembre.
