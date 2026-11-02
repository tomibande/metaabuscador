# Parches sugeridos

**Nada de esto está aplicado.** Cada parche dice qué archivo toca, qué riesgo tiene y si necesita
migración de base. Están ordenados de más seguro a más invasivo.

Los que dicen **verificado** los probé en una copia del proyecto, fuera del repo, y confirmé que los
30 tests siguen pasando. Los que no lo dicen, no los ejecuté.

| Parche | Archivos | Migración | Riesgo | Estado |
|---|---|---|---|---|
| B5 · `.env.example` | 1 nuevo | no | ninguno | listo |
| B17 · fecha fija en el test | `test/validar.test.js` | no | ninguno | verificado |
| B1 · buscar para hoy | `src/lib/validar.js` | no | bajo | **verificado** |
| P2 · 401 reabre el login | `src/components/Buscador.js` | no | bajo | listo |
| B7 · `required` en nombre | `src/components/DialogoAuth.js` | no | ninguno | listo |
| B13 · `.gitignore` | `.gitignore` | no | ninguno | listo |
| B16 · `conErrores` | `src/app/metabuscar/route.js` | no | bajo | listo |
| F2 · contador | `src/components/Buscador.js` | no | ninguno | listo |
| F1 · feedback optimista | `src/components/Buscador.js` | no | medio | listo |
| P1-A · clave estable | 2 archivos | no | medio | **verificado** |
| P1-B · identidad propia | varios | **sí** | alto | a decidir |
| B6 · código muerto | varios | no | — | a decidir |

---

## B5 · Crear `.env.example` — *el más barato de todos*

Archivo nuevo en la raíz. El README ya manda copiarlo, solo falta que exista.

```bash
# .env.example — copiá este archivo como .env y completá los valores

# Clave de SerpApi para consultar Google Hotels -> https://serpapi.com/manage-api-key
SERPAPI_API_KEY=

# Secreto para firmar las cookies de sesión.
# Generalo con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=

# Base de datos SQLite local (la crea `npm run db:init`)
DATABASE_URL="file:./prisma/dev.db"
```

**Comprobá que `.gitignore` no lo tape.** Hoy ignora `.env` pero no `.env.example`, así que entra bien.
Confirmalo antes de commitear:

```bash
git check-ignore -v .env.example || echo "OK: se puede commitear"
```

---

## B17 · Sacar la fecha fija del test — *verificado*

`test/validar.test.js:10`. El archivo ya define `checkInFuturo`/`checkOutFuturo` relativos al día en
que corre; esta línea los pisaba con fechas fijas.

```js
// ANTES
const r = validarFiltros({ ...base, precioMax: 100, checkIn: '2026-12-01', checkOut: '2026-12-05', servicios: ['wifi'] });

// DESPUÉS — usa las fechas relativas que ya están en el archivo
const r = validarFiltros({ ...base, precioMax: 100, servicios: ['wifi'] });
```

`base` ya trae `checkIn: checkInFuturo, checkOut: checkOutFuturo` (líneas 5-7), así que el test queda
probando exactamente lo mismo pero sin caducar.

---

## B1 · Permitir buscar para hoy — *verificado*

`src/lib/validar.js`, reemplaza las líneas 40-44.

```js
// ANTES
  const noches = (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000;
  const diasHastaLlegada = (Date.parse(checkIn) - Date.now()) / 86_400_000;
  if (noches > 90 || diasHastaLlegada < 0 || diasHastaLlegada > 500) {
    return { error: 'Las fechas deben estar dentro de los próximos 500 días y la estadía no puede superar 90 noches.' };
  }
```

```js
// DESPUÉS
  // Medianoche UTC de hoy, para comparar día contra día (Date.now() es un instante y descartaba hoy).
  const hoyUtc = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const noches = (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000;
  const diasHastaLlegada = (Date.parse(checkIn) - hoyUtc) / 86_400_000;
  if (diasHastaLlegada < -1) return { error: 'La fecha de llegada ya pasó.' };
  if (diasHastaLlegada > 500) return { error: 'La llegada debe estar dentro de los próximos 500 días.' };
  if (noches > 90) return { error: 'La estadía no puede superar 90 noches.' };
```

Dos cambios: compara contra **medianoche de hoy** en vez de contra el instante actual, y **separa los
tres mensajes** para que cada error diga qué pasó.

**Sobre el `< -1` en vez de `< 0`:** el servidor no conoce la zona horaria del usuario. En Argentina
(UTC-3), a las 22:00 del 2 de noviembre el servidor ya está en el 3 de noviembre UTC, y una llegada
"hoy" se leería como pasada. Ese día de tolerancia lo cubre. El costo es que acepta una llegada de
ayer, que Google Hotels va a rechazar igual del otro lado. Si preferís ser estricto, poné `< 0` y
sabé que alguien buscando de noche puede ver un rechazo raro.

Verificado en una copia:

```
hoy -> manana                "OK"              <- antes fallaba
manana -> en 3 dias          "OK"
ayer (debe fallar)           "La fecha de llegada ya pasó."
a 600 dias (falla)           "La llegada debe estar dentro de los próximos 500 días."
120 noches (falla)           "La estadía no puede superar 90 noches."

# tests 30  # pass 30  # fail 0
```

Los tests no comparan el texto de los mensajes (todos usan `assert.ok(...error)`), por eso separarlos
no rompe nada.

---

## P2 · Que el 401 reabra el login

`src/components/Buscador.js:58-66`. `cliente.js:6` ya te adjunta `status` al error, así que solo hay
que mirarlo.

```js
// ANTES
    } catch (e) { alert(e.message); }
```

```js
// DESPUÉS
    } catch (e) {
      if (e.status === 401) {     // la cookie venció mientras la página estaba abierta
        setUsuario(null);
        setFavoritos([]);
        return setAuth('login');
      }
      alert(e.message);
    }
```

Lo mismo en `quitarFavorito` (`:68-73`). Con esto la sesión vencida reabre el diálogo en vez de dejar
al usuario trabado.

---

## B7 · `required` en el nombre del registro

`src/components/DialogoAuth.js:36`:

```jsx
// ANTES
<label>Nombre <input name="nombre" maxLength={60} autoComplete="name" /></label>

// DESPUÉS
<label>Nombre <input name="nombre" maxLength={60} autoComplete="name" required /></label>
```

**Ojo:** el `<form>` tiene `noValidate` (`:33`), que desactiva la validación nativa del navegador. Si
querés que el `required` haga efecto, sacá también ese `noValidate` — y entonces `email` y `password`
también empiezan a validarse en el navegador, que es lo que se espera. El servidor sigue validando
igual en los dos casos, así que no perdés seguridad.

---

## B13 · `.gitignore` sin duplicados

```
node_modules/
.next/
.env
.env.local
*.db
*.db-journal
prisma/dev.db
```

(Las líneas 8-11 de hoy repiten las primeras tres.)

---

## B16 · Envolver `metabuscar` con `conErrores`

`src/app/metabuscar/route.js`. Queda consistente con las otras cinco rutas.

```js
// ANTES
import { json, leerJson } from '@/lib/http';
...
export async function POST(request) {

// DESPUÉS
import { json, leerJson, conErrores } from '@/lib/http';
...
export const POST = conErrores(async (request) => {
```

Y cerrás con `});` en vez de `}` al final de la función.

**Cuidado:** `conErrores` responde `{ error: 'Error interno del servidor.' }` sin el campo `ok`, y
`Buscador.js:46` chequea `if (!datos.ok)`. Como `undefined` es falso, el frontend igual entra por la
rama de error y muestra `datos.error`. Funciona, pero si querés que el shape sea estrictamente
`{ ok, resultados, error }` en todos los casos, conviene un wrapper propio para esta ruta.

---

## F2 · Contador de favoritos en la pestaña

`src/components/Buscador.js:137`:

```jsx
// ANTES
{vista === 'favoritos' ? 'Volver a la búsqueda' : 'Ver mis favoritos'}

// DESPUÉS
{vista === 'favoritos' ? 'Volver a la búsqueda' : `Ver mis favoritos (${favoritos.length})`}
```

---

## F1 · Feedback optimista en el corazón

`src/components/Buscador.js:58-66`. Hoy el corazón cambia después de dos viajes al servidor (el POST y
el GET completo de `cargarFavoritos`). Esto lo cambia al instante y revierte si falla.

```js
async function alternarFavorito(r) {
  if (!usuario) return setAuth('login');
  const previos = favoritos;                       // para poder volver atrás
  const existente = favoritos.find((f) => f.urlOrigen === r.url);

  // 1. la interfaz reacciona ya
  setFavoritos(existente
    ? favoritos.filter((f) => f.id !== existente.id)
    : [...favoritos, { id: `tmp-${r.url}`, urlOrigen: r.url, nombreAlojamiento: r.nombre,
                       precio: r.precioNumero, imagenUrl: r.imagen, fechaGuardado: new Date().toISOString() }]);

  // 2. y después se confirma contra el servidor
  try {
    if (existente) await api(`/api/favoritos/${existente.id}`, { method: 'DELETE' });
    else await api('/api/favoritos', { method: 'POST', body: JSON.stringify({ nombre: r.nombre, precio: r.precioNumero, url: r.url, imagen: r.imagen }) });
    await cargarFavoritos();                       // trae los id reales
  } catch (e) {
    setFavoritos(previos);                         // falló: se revierte
    if (e.status === 401) { setUsuario(null); return setAuth('login'); }
    alert(e.message);
  }
}
```

Dos detalles que importan:

- El `id` temporal (`tmp-...`) existe solo hasta que `cargarFavoritos()` trae el real. Es la razón por
  la que el `cargarFavoritos()` **se queda**: sin él, un clic en "Quitar" sobre un favorito recién
  creado mandaría `DELETE /api/favoritos/tmp-...` y fallaría.
- **Doble clic rápido:** sigue siendo posible mandar dos pedidos. El backend lo tolera (`upsert` y
  `deleteMany` son idempotentes), pero lo correcto es deshabilitar el botón mientras hay un pedido en
  vuelo. Para eso necesitás un estado tipo `enVuelo` y pasarlo como `disabled` al botón de
  `Tarjeta.js:35`.

Riesgo medio porque toca el estado de React, no porque sea difícil. Probalo a mano: guardar, quitar,
guardar de nuevo, y cortar la red para ver que revierte.

---

## P1-A · Clave estable del favorito, sin migración — *verificado*

Arregla la duplicación de favoritos (P1 en `02-FAVORITOS.md`) **sin tocar la base**. La idea: antes de
guardar o comparar, quitarle a la URL los parámetros que cambian en cada búsqueda.

**Paso 1.** En `src/lib/cliente.js` (no tiene `'use client'`, así que el servidor también lo puede
importar), agregar:

```js
// El enlace de Google Hotels lleva fechas y huéspedes adentro, así que el mismo alojamiento
// generaba una URL distinta por búsqueda. Esta clave ignora esos parámetros.
const VOLATILES = ['checkin', 'checkout', 'adults', 'curr', 'check_in_date', 'check_out_date', 'currency'];

export function claveAlojamiento(v) {
  try {
    const u = new URL(v);
    for (const p of VOLATILES) u.searchParams.delete(p);
    u.searchParams.sort();        // el orden de los parámetros no debe cambiar la clave
    return u.href;
  } catch {
    return v;
  }
}
```

**Paso 2.** En `src/app/api/favoritos/route.js`, guardar la clave en lugar de la URL cruda:

```js
import { claveAlojamiento } from '@/lib/cliente';
...
const clave = claveAlojamiento(url);
const favorito = await prisma.favorito.upsert({
  where: { idUsuario_urlOrigen: { idUsuario: id, urlOrigen: clave } },
  update: {},
  create: { idUsuario: id, nombreAlojamiento: nombre.trim(), precio: precioNum, urlOrigen: clave, imagenUrl: imagen ?? null },
});
```

**Paso 3.** En `src/components/Buscador.js`, comparar con la misma clave en los dos lugares
(`:60` y `:100`):

```js
const existente = favoritos.find((f) => f.urlOrigen === claveAlojamiento(r.url));
// y
esFavorito={favoritos.some((f) => f.urlOrigen === claveAlojamiento(r.url))}
```

Verificado:

```
clave(A: 1-5 dic)  = https://www.google.com/travel/search?q=Hotel+Llao+Llao+Bariloche
clave(B: 10-14 ene)= https://www.google.com/travel/search?q=Hotel+Llao+Llao+Bariloche
A y B son el mismo favorito?           -> SI (arreglado)
enlace directo de proveedor intacto?   -> SI
URL basura no explota?                 -> devuelve la cadena tal cual
```

**Lo que perdés, y es real:** al guardar la URL sin fechas, el botón "Ver oferta" del favorito
(`Tarjeta.js:58`) abre el hotel en Google Hotels **sin las fechas de tu búsqueda**. El usuario las
tiene que volver a poner. Es un paso atrás a cambio de no tener favoritos duplicados; a mí me parece
que vale, pero es tu decisión.

**Los favoritos ya guardados no se migran.** Los viejos quedan con la URL completa y van a convivir
con los nuevos como entradas separadas. Para la feria, con la base de desarrollo, lo más simple es
borrar `prisma/dev.db` y volver a correr `npm run db:init`.

---

## P1-B · Identidad propia del alojamiento — *necesita migración*

La solución correcta, para cuando tengas tiempo. En vez de usar la URL como identidad, guardar una
clave propia y **además** la URL completa con fechas.

```prisma
model Favorito {
  id                Int      @id @default(autoincrement())
  idUsuario         Int
  usuario           Usuario  @relation(fields: [idUsuario], references: [id], onDelete: Cascade)
  claveAlojamiento  String   // nombre normalizado + destino: la identidad real
  nombreAlojamiento String
  precio            Float?
  moneda            String?  // arregla B11
  checkIn           String?  // arregla B11 y habilita F7
  checkOut          String?
  huespedes         Int?
  urlOrigen         String   // la URL completa, con fechas, para "Ver oferta"
  imagenUrl         String?
  fechaGuardado     DateTime @default(now())

  @@unique([idUsuario, claveAlojamiento])   // en lugar de [idUsuario, urlOrigen]
}
```

Con `claveAlojamiento` armada en el servidor como, por ejemplo,
`` `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')}|${destino.toLowerCase()}` ``.

Esto resuelve de una P1, B11 y la mitad de P3, **y habilita F6, F7 y F8** de `02-FAVORITOS.md`. Es una
sola migración (`npx prisma migrate dev --name favorito-identidad`) y hay que pasarle `destino` al POST,
que hoy no lo recibe.

Riesgo alto porque cambia la clave única de una tabla con datos. En desarrollo no importa; si ya
tenés datos que te importan, exportalos antes.

---

## B6 · Qué hacer con Tavily, Gemini y `filtrar.js`

Las dos salidas son defendibles. Lo que no conviene es dejarlo como está, sin decidir.

### Opción 1 — Borrarlo (recomendada si entregás pronto)

```bash
git rm src/servicios/tavily.js src/servicios/gemini.js src/lib/filtrar.js src/lib/reintentos.js
git rm test/tavily.test.js test/filtrar.test.js test/reintentos.test.js
npm uninstall @google/genai
```

Y en `package.json:4`, corregir la descripción, que hoy contradice al README:

```json
"description": "Metabuscador de alojamientos ICLUD (Next.js + SerpApi/Google Hotels + Prisma)",
```

Antes de borrar, confirmá que no quedó nada colgado:

```bash
grep -rn "tavily\|gemini\|filtrar\|reintentos\|genai" --include=*.js --include=*.json src test package.json
npm test
```

Quedás con 4 archivos de test que prueban **solo** el código que corre de verdad. Son menos de 30
tests, y eso es mejor, no peor: el número pasa a significar algo.

### Opción 2 — Dejarlo documentado como v1

Si te parece que el trabajo con Tavily y Gemini vale como antecedente, movelo a `src/_v1-ia/` con un
`README.md` adentro que diga en dos renglones qué era y por qué se reemplazó por SerpApi. Igual
corregí la descripción del `package.json`.

Es más defendible que dejarlo mezclado con el código vivo: si te preguntan, la respuesta es "probamos
dos arquitecturas, esta es la que quedó y la otra está archivada ahí", que suena a decisión y no a
descuido.
