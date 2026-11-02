# La parte de "me gusta" (favoritos) — análisis y qué añadir

Esto es lo que más te interesaba, así que va a fondo. Primero cómo funciona hoy, después los tres
problemas reales que tiene, y al final 15 funciones para añadir ordenadas por impacto sobre esfuerzo.

---

## 1. Cómo funciona hoy

Siete archivos participan:

```
prisma/schema.prisma:19-30          modelo Favorito
src/app/api/favoritos/route.js      GET (listar) · POST (guardar)
src/app/api/favoritos/[id]/route.js DELETE (quitar)
src/lib/auth.js:25                  usuarioId(request) — saca el id del JWT de la cookie
src/components/Buscador.js:26-73    estado, alternarFavorito, quitarFavorito
src/components/Tarjeta.js:16-62     TarjetaResultado (corazón) · TarjetaFavorito (quitar)
src/lib/cliente.js:3                api() — fetch + manejo de error
```

El flujo del corazón:

```
clic en ♡
  └─ Buscador.alternarFavorito(r)                    [Buscador.js:58]
       ├─ ¿sin usuario? -> abre el diálogo de login
       ├─ ¿ya está en favoritos? -> DELETE /api/favoritos/:id
       ├─ ¿no está?        -> POST /api/favoritos
       └─ cargarFavoritos() -> GET /api/favoritos (la lista completa, de nuevo)
            └─ setFavoritos(...) -> React re-renderiza -> el corazón recién ahora cambia
```

### Lo que está bien hecho

No es relleno; estas cuatro cosas suelen estar mal en proyectos parecidos:

- **Autorización en cada endpoint.** Los tres handlers arrancan con `usuarioId(request)` y cortan con
  401 si no hay sesión. No hay forma de leer los favoritos de otro.
- **El `DELETE` usa `deleteMany` con doble condición** (`[id]/route.js:12`):
  ```js
  await prisma.favorito.deleteMany({ where: { id, idUsuario: usuario } });
  ```
  Filtra por `idUsuario` además del `id`, así que no podés borrar el favorito de otra persona pasando
  un id ajeno. Y al devolver `{ ok: true }` siempre, no filtra si ese id existía o no. Las dos
  decisiones son correctas y deliberadas — es un IDOR bien cerrado.
- **El `POST` valida de verdad** (`route.js:29-33`): tipo, largo máximo, y `urlHttp()` que solo acepta
  `http(s)`. Sin eso, un `javascript:` guardado en la base sale renderizado como enlace después.
- **`upsert` en lugar de `create`** (`route.js:35`): guardar dos veces el mismo alojamiento no explota
  con error de clave única. Es idempotente.

Sobre esta base, los problemas de abajo son arreglables sin rehacer nada.

---

## 2. Los tres problemas reales

### P1 · Los favoritos se duplican y el corazón se desincroniza (el grave)

La clave única del favorito es la URL:

```prisma
// prisma/schema.prisma:29
@@unique([idUsuario, urlOrigen])
```

Y cuando Google Hotels no da enlace directo del proveedor, la URL se **construye con las fechas y los
huéspedes adentro**:

```js
// src/servicios/serpapi.js:16-22
const url = new URL('https://www.google.com/travel/search');
url.searchParams.set('q', `${propiedad.name} ${filtros.destino}`);
url.searchParams.set('checkin',  filtros.checkIn);     // <-- acá
url.searchParams.set('checkout', filtros.checkOut);    // <-- y acá
url.searchParams.set('adults', String(filtros.huespedes));
```

Entonces el **mismo hotel** buscado con otras fechas produce otra URL, y para la base es otro
alojamiento. Reproducido:

```
Búsqueda A (1-5 dic):  ...?q=Hotel+Llao+Llao+Bariloche&checkin=2026-12-01&checkout=2026-12-05&adults=2
Búsqueda B (10-14 ene): ...?q=Hotel+Llao+Llao+Bariloche&checkin=2027-01-10&checkout=2027-01-14&adults=2

¿Misma clave única? -> NO
```

Dos síntomas, los dos visibles en una demo:

1. **Favoritos duplicados.** Guardás el Llao Llao en diciembre, después lo guardás en enero: tu lista
   muestra el mismo hotel dos veces, con precios distintos y sin ninguna pista de por qué.
2. **El corazón no se marca.** `Buscador.js:100` decide si está guardado comparando URLs:
   ```js
   esFavorito={favoritos.some((f) => f.urlOrigen === r.url)}
   ```
   Buscás de nuevo con otras fechas un hotel que ya tenías guardado y aparece como ♡ *Guardar*, no
   como ♥ *Guardado*. El usuario lo vuelve a guardar y llega al síntoma 1.

Es el hallazgo más importante de los favoritos porque **no parece un bug**: parece que la app se
olvidó de lo que guardaste.

**Por qué no lo arreglo yo:** la solución pasa por decidir qué es "el mismo alojamiento", y eso es una
decisión de producto tuya, además de pedir migración de la base. Las dos opciones están en
`03-PARCHES.md` (P1-A, barata y sin migración; P1-B, correcta y con migración).

### P2 · Si la sesión vence, guardar muere en un `alert()` sin salida

La cookie dura 7 días (`lib/auth.js:10`, `expiresIn: '7d'`). Cuando vence, el estado de React **sigue
teniendo** al usuario cargado de cuando abriste la página.

```js
// src/components/Buscador.js:58-66
async function alternarFavorito(r) {
  if (!usuario) return setAuth('login');   // <- mira el estado de React, no la cookie
  ...
  } catch (e) { alert(e.message); }        // <- acá cae el 401
}
```

El guard de la primera línea pasa (React cree que hay sesión), el POST vuelve **401 "Iniciá sesión
para continuar"** (`api/favoritos/route.js:26`), y eso termina en un `alert()` del navegador.

El usuario lee "Iniciá sesión para continuar" y **no tiene dónde hacerlo**: el diálogo no se abrió, el
encabezado sigue diciendo "Hola, Tomás", y el botón ya no responde. Callejón sin salida.

El arreglo son tres líneas y el `api()` de `cliente.js:6` ya te adjunta el `status` al error, así que
tenés todo lo que hace falta. Parche P2 en `03-PARCHES.md`.

### P3 · El precio guardado es un número sin contexto

El modelo guarda seis campos:

```prisma
// prisma/schema.prisma:19-30
nombreAlojamiento String
precio            Float?     // <-- un número, nada más
urlOrigen         String
imagenUrl         String?
fechaGuardado     DateTime
```

No guarda **moneda**, ni **fechas de la estadía**, ni **huéspedes**, ni **descripción**, ni **servicios**.
Tres consecuencias:

**a) El precio se muestra ambiguo.** Comparadas lado a lado:

| | Tarjeta de resultado | Tarjeta de favorito |
|---|---|---|
| Código | `serpapi.js:57` con `Intl.NumberFormat('en-US', {currency:'USD'})` | `Tarjeta.js:55` con `.toLocaleString('es-AR')` |
| Se ve | `$1,234.00` | `1.234` |

El mismo precio, dos formatos, y el guardado **pierde el símbolo**. Hoy siempre es USD porque se le
pide USD a SerpApi (`serpapi.js:78`), así que no hay error de datos — pero nada lo registra. El día
que agregues ARS, los favoritos viejos quedan ilegibles y sin forma de saber qué eran.

**b) El precio es una foto vieja sin fecha visible.** Guardaste US$120 "por noche"... ¿de qué noches?
Sin `checkIn`/`checkOut` guardados, el número no se puede ni interpretar ni volver a consultar.

**c) La vista de favoritos es más pobre que la de resultados.** Mirá qué muestra cada una:

| Dato | Resultado | Favorito | Por qué |
|---|---|---|---|
| Nombre | sí | sí | |
| Precio | sí, con moneda | sí, sin moneda | (a) |
| Foto | sí | sí | |
| **Origen** (`Oferta de booking.com`) | sí `Tarjeta.js:24` | **no** | no se guarda el host |
| **Descripción** / calificación | sí `:25` | **no** | no se guarda |
| **Servicios** (wifi, cocina...) | sí `:26-28` | **no** | no se guardan |

El usuario guarda una tarjeta rica y vuelve a encontrar una pobre. Es un bajón de calidad perceptible,
y es la raíz de casi todas las mejoras de la sección 3.

---

## 3. Qué añadir — 15 funciones priorizadas

Ordenadas por **impacto sobre esfuerzo**. Las primeras cinco se hacen en una tarde y se ven en una demo.

### Muy barato, se nota mucho

**F1 · Feedback optimista en el corazón** — *~15 líneas, sin migración*
Hoy cada clic son dos viajes al servidor (POST + GET completo) antes de que el corazón cambie, así que
se siente lento (es B10 en `01-ERRORES.md`). Cambiá el estado local primero, revertí si el servidor
falla. Y deshabilitá el botón mientras el pedido está en vuelo, que además mata el doble clic.
**La mejora más rentable de la lista.**

**F2 · Contador en la pestaña** — *1 línea*
`Ver mis favoritos (3)`. Ya tenés `favoritos.length` en `Buscador.js:19`. Es gratis y le dice al
usuario que lo que guardó está ahí.

**F3 · Deshacer al quitar** — *~20 líneas*
Hoy "Quitar" (`Tarjeta.js:57`) borra sin confirmar y sin vuelta atrás. Un aviso de 5 segundos con
"Quitaste X · Deshacer" evita el borrado accidental sin meter un diálogo de confirmación molesto.
Guardás el objeto borrado en estado y lo re-posteás si hacen clic.

**F4 · Avisos en vez de `alert()`** — *~10 líneas*
Es B4. Reusá tu propio componente `Aviso` (`Buscador.js:8-15`), que ya tiene `role="alert"` y estilo.
Coherencia y accesibilidad de una.

**F5 · Ordenar la lista de favoritos** — *~25 líneas*
Hoy el orden está fijo en `fechaGuardado desc` (`api/favoritos/route.js:20`). Un `<select>` con
precio / fecha / nombre. Si ordenás en el cliente sobre el array que ya tenés, no toca el backend.

### Vale la pena, pide migración

**F6 · Guardar el contexto de la búsqueda** — *migración + ~20 líneas*
Agregar al modelo: `moneda`, `checkIn`, `checkOut`, `huespedes`, `destino`.
Arregla P3 entero y **habilita F7, F8 y F10**. Si vas a hacer una sola migración, hacé esta.

**F7 · Precio guardado contra precio actual** — *~60 líneas, necesita F6*
Al abrir favoritos, re-consultar y mostrar **"bajó US$12 desde que lo guardaste"** o *"subió US$30"*.

Esta es **la función estrella**. Es lo que convierte tu lista de favoritos en algo que un marcador del
navegador no puede hacer, y es exactamente la gracia de un metabuscador: no guardás un link, guardás
un precio para vigilarlo. Si vas a añadir **una sola** cosa a los favoritos, añadí esta.

Cuidado: cada re-consulta es un crédito de SerpApi (B15). Hacela a pedido con un botón "Actualizar
precios", no automática al abrir la vista.

**F8 · Completar la tarjeta de favorito** — *migración + ~15 líneas*
Guardar `descripcion`, `servicios` y el host de origen para cerrar la tabla de P3-c. Así la tarjeta
guardada se ve igual que la de resultado, con sus etiquetas de wifi/cocina y su "Oferta de...".

**F9 · Comparar favoritos lado a lado** — *~80 líneas*
Checkbox en cada tarjeta, elegís 2 a 4, y los ves en tabla: precio, servicios, calificación, origen.
**Muy vendible en una demo**, y es justo lo que alguien hace de verdad cuando elige alojamiento.

**F10 · Alerta de bajada de precio** — *necesita F6 + F7 + tarea programada*
La extensión natural de F7: avisar por email cuando un favorito baja de cierto precio. Ambicioso para
la cursada, pero mencionarlo como "próximo paso" muestra que pensaste el producto más allá de la
entrega.

### Según cuánto tiempo tengas

**F11 · Notas personales** — *migración (`nota String?`) + ~20 líneas*
Un textarea por favorito: *"tiene cocina pero está lejos del centro"*. Simple y la gente lo usa.

**F12 · Carpetas o listas** — *modelo nuevo `Lista` 1—N `Favorito` + ~100 líneas*
"Viaje a Bariloche", "Luna de miel". Es el salto de lista plana a organizador. Buen tema de DER si te
preguntan por el modelo de datos.

**F13 · Exportar a CSV** — *~30 líneas*
Un botón "Descargar". Concreto, fácil de mostrar, y se arma con lo que ya tenés en memoria.

**F14 · Marcar "ya reservado"** — *migración (`estado String`) + ~20 líneas*
Que un favorito pase a resuelto en vez de borrarse. Cierra el ciclo de uso.

**F15 · Favoritos sin cuenta, con migración al registrarse** — *~60 líneas*
Hoy `Buscador.js:59` exige login **antes** de poder guardar nada, y eso frena al usuario justo en el
momento de mayor intención. Guardalos en `localStorage` para los anónimos y subilos a la base cuando
se registre.

Es la mejora con más impacto en adopción real de toda la lista, pero también la que más cuidado pide:
tenés que resolver qué pasa si guardó algo anónimo y después entra a una cuenta que ya tenía ese mismo
alojamiento.

### Compartir — mencionado aparte

**F16 · Compartir la lista por link público**
Un token de solo lectura para mandarle tus favoritos a alguien. Suena simple y es la que más
cuidado pide: estás publicando datos de un usuario en una URL sin autenticación. Si la hacés, que el
token sea aleatorio y largo (no el `id` del usuario), que caduque, y que se pueda revocar. Y que **no**
exponga el email ni el nombre de quien compartió.

---

## 4. Lo que yo haría, en orden

1. **P2** (3 líneas) — el callejón sin salida de la sesión vencida es el peor síntoma para un usuario real
2. **F1 + F2** (una tarde) — el corazón se siente instantáneo y se ve el contador
3. **P1-A** (`03-PARCHES.md`) — corta la duplicación de favoritos sin migración
4. **F6** (una migración sola) — y con eso ya tenés la base de F7 y F8
5. **F7** — la función que justifica que esto sea un metabuscador y no una lista de links
