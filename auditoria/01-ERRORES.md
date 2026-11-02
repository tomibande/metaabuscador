# Errores y hallazgos

16 hallazgos, de mayor a menor gravedad. Cada uno con archivo:línea, qué pasa y cómo comprobarlo.
Ninguno está corregido en el código. Los parches están en `03-PARCHES.md`.

---

## GRAVEDAD ALTA

### B1 · No se puede buscar para hoy

**Dónde:** `src/lib/validar.js:41-44` contra `src/components/FormularioBusqueda.js:37`

```js
// validar.js:41
const diasHastaLlegada = (Date.parse(checkIn) - Date.now()) / 86_400_000;
if (noches > 90 || diasHastaLlegada < 0 || diasHastaLlegada > 500) { ... }
```

`Date.parse('2026-11-02')` devuelve la **medianoche UTC** de ese día. `Date.now()` es el instante
actual. A cualquier hora después de las 00:00 UTC, `diasHastaLlegada` es **negativo** y la búsqueda
se rechaza.

Mientras tanto el formulario ofrece hoy como fecha válida (`min={hoy}`), así que el usuario elige una
fecha que la interfaz le habilita y recibe un error.

**Reproducción** (verificada hoy, 2026-11-02):

```bash
node -e "import('./src/lib/validar.js').then(({validarFiltros})=>{
  const hoy=new Date().toISOString().slice(0,10);
  const man=new Date(Date.now()+864e5).toISOString().slice(0,10);
  console.log(validarFiltros({destino:'Bariloche',checkIn:hoy,checkOut:man}));
})"
```

Salida real:

```
{ error: 'Las fechas deben estar dentro de los próximos 500 días y la estadía no puede superar 90 noches.' }
```

**Agravante:** ese mensaje mezcla tres causas distintas (estadía larga, fecha pasada, fecha muy lejana).
El usuario que pidió hoy para mañana lee algo sobre "90 noches" y "500 días" que no tiene nada que ver
con lo que hizo. No puede deducir que el problema es la fecha de llegada.

**Impacto:** alguien que busca alojamiento para esta noche —un caso de uso central en un
metabuscador— no puede. Y el mensaje no le dice por qué.

---

### B2 · Los favoritos se duplican y el corazón se desincroniza

Está detallado en `02-FAVORITOS.md`, porque es el hallazgo central de esa parte. En resumen:
`urlDeOferta` (`serpapi.js:16-22`) mete `checkin`, `checkout` y `adults` dentro de la URL, y la clave
única del favorito es esa URL (`schema.prisma:29`). Mismo hotel + otras fechas = favorito nuevo.

---

### B5 · Falta `.env.example` aunque el README manda copiarlo

**Dónde:** `README.md` línea ~20 contra la raíz del repo

El README dice:

> Copiá `.env.example` como `.env` (en la raíz del proyecto):
> - Windows (CMD): `copy .env.example .env`
> - Mac / Linux: `cp .env.example .env`

**El archivo no existe en el repositorio.** Verificado con `ls -a`. No es que `.gitignore` lo esté
tapando: `.gitignore` ignora `.env`, no `.env.example`. Simplemente nunca se commiteó.

**Impacto:** cualquiera que clone el repo —un compañero, un evaluador, vos en otra máquina— sigue el
README al pie de la letra y el segundo paso falla. Y como el archivo no está, tampoco hay forma de
saber **qué variables** hay que completar sin leer el código. Hoy son cuatro, repartidas en tres
archivos distintos:

| Variable | Dónde se lee | ¿Obligatoria? |
|---|---|---|
| `SERPAPI_API_KEY` | `servicios/serpapi.js:68`, `app/metabuscar/route.js:14` | **Sí**, sin esto no hay búsquedas |
| `JWT_SECRET` | `lib/auth.js:4` | **Sí**, sin esto explota el login |
| `DATABASE_URL` | `prisma/schema.prisma:7` | **Sí**, sin esto no hay base |
| `NODE_ENV` | `lib/auth.js:14`, `lib/db.js:6` | No, la pone Next |

El parche está en `03-PARCHES.md` y es el más barato de todos.

---

### B17 · Los tests dejan de pasar el 2026-12-01

**Dónde:** `test/validar.test.js:10`

El archivo define bien las fechas de forma **relativa** al día en que corre:

```js
// test/validar.test.js:5-7
const checkInFuturo  = new Date(Date.now() +  7 * 86_400_000).toISOString().slice(0, 10);
const checkOutFuturo = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const base = { destino: 'Bariloche', huespedes: 2, checkIn: checkInFuturo, checkOut: checkOutFuturo };
```

Pero el primer test **las pisa con fechas fijas**:

```js
// test/validar.test.js:10
const r = validarFiltros({ ...base, precioMax: 100, checkIn: '2026-12-01', checkOut: '2026-12-05', servicios: ['wifi'] });
assert.equal(r.error, undefined);
```

Hoy (2026-11-02) el 1 de diciembre está a 29 días, así que pasa. **A partir del 2026-12-01 esa fecha
queda en el pasado**, `validarFiltros` devuelve error, y el test falla.

**Reproducción** (adelantando el reloj 43 días):

```bash
node -e "
const real = Date.now;
Date.now = () => real.call(Date) + 43 * 86400000;
import('./src/lib/validar.js').then(({validarFiltros})=>{
  console.log(validarFiltros({destino:'Bariloche',huespedes:2,precioMax:100,
    checkIn:'2026-12-01',checkOut:'2026-12-05',servicios:['wifi']}).error);
});"
```

Salida:

```
Hoy simulado: 2026-12-15
test/validar.test.js:10 espera  -> r.error === undefined
en esa fecha devuelve           -> "Las fechas deben estar dentro de los próximos 500 días..."
EL TEST FALLA a partir del 2026-12-01
```

**Impacto:** si te evalúan en diciembre, `npm test` muestra un test roto y vas a estar explicando por
qué falla algo que no tocaste. El resto del archivo ya usa `checkInFuturo`/`checkOutFuturo`; esta línea
quedó con fechas fijas por descuido.

**Dato útil para los demás parches:** revisé los 7 archivos de test y **ninguno compara el texto
exacto de los mensajes de error** — todos usan `assert.ok(...error)`, que solo verifica que haya error.
Eso significa que podés **separar y reescribir los mensajes de `validar.js` sin romper ningún test**.
Es lo que aprovecha el parche B1.

---

## GRAVEDAD MEDIA

### B3 · Sesión vencida: guardar un favorito muere sin salida

Detallado en `02-FAVORITOS.md`. La cookie dura 7 días (`auth.js:10`); cuando vence, el estado de React
todavía cree que hay usuario, el POST vuelve 401 y el usuario ve un `alert()` que le dice "Iniciá
sesión" sin abrirle el login.

---

### B6 · Código muerto: Tavily, Gemini y `filtrar.js`

**Dónde:** `src/servicios/tavily.js`, `src/servicios/gemini.js`, `src/lib/filtrar.js`, `src/lib/reintentos.js`

La arquitectura cambió de **Tavily + Gemini** (buscar en la web y que la IA estructure el texto) a
**SerpApi / Google Hotels** (datos ya estructurados). El README ya está actualizado y describe bien el
flujo nuevo. El código viejo quedó.

Verificado con grep: **de la aplicación no lo importa nadie.** Solo lo importan los tests.

```
src/servicios/gemini.js:4   import { conReintentos } from '../lib/reintentos.js';   <- muerto importa muerto
test/reintentos.test.js:3   import { conReintentos, esTransitorio } ...
test/filtrar.test.js:3      import { filtrarResultados } ...
test/tavily.test.js:3       import { buscarEnWeb, construirConsulta } ...
```

`lib/metabuscar.js:4` importa **solo** `serpapi.js`. Ese es todo el camino real.

Consecuencias concretas:

- **Tres de los siete archivos de test** (`filtrar`, `tavily`, `reintentos`) prueban código que nunca
  se ejecuta en producción. De los 30 tests que pasan, buena parte verifica una arquitectura retirada.
  El número "30/30 en verde" dice menos de lo que parece.
- `package.json:4` sigue describiendo el proyecto como **"Next.js + Tavily + Gemini + Prisma"**.
  Contradice al README, que es el que está bien.
- `@google/genai` (`package.json`) se instala y nunca se usa. Peso de más en `npm install`.
- En una evaluación, que te pregunten "¿y esto de Gemini qué hace?" y la respuesta sea "nada, quedó"
  es peor que no tenerlo.

**No es un bug:** nada se rompe. Es una decisión pendiente, y hay dos salidas válidas —ver
`03-PARCHES.md`. Lo que no conviene es dejarlo ambiguo.

---

### B11 · El favorito guarda el precio sin moneda ni contexto

Detallado en `02-FAVORITOS.md`. `schema.prisma:24` guarda `precio Float?` y nada más: ni moneda, ni
fechas, ni huéspedes. `Tarjeta.js:55` lo muestra como `1.234` sin símbolo, mientras la tarjeta de
resultado muestra `$1,234.00`. Mismo dato, dos caras distintas, y la guardada es ambigua.

---

### B9 · Rate limit evadible, y los favoritos no tienen ninguno

**Dónde:** `src/lib/limitador.js:18`, y su ausencia en `src/app/api/favoritos/`

```js
// limitador.js:18
return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
```

`x-forwarded-for` lo pone el cliente. Si la app no está detrás de un proxy que lo reescriba, cualquiera
manda un header distinto en cada pedido y el límite de 10 búsquedas por minuto no existe. Cada búsqueda
evadida es **un crédito de SerpApi**.

Aparte: `auth/login`, `auth/registro` y `metabuscar` llaman a `permitir()`. **`api/favoritos/*` no
llama a ninguno.** Un usuario con sesión puede martillar POST/DELETE sin tope.

Lo de "vive en memoria" (se reinicia con el servidor, no se comparte entre instancias) ya está asumido
en el comentario del propio archivo —"alcanza para desarrollo y la feria"— y para este proyecto es una
decisión razonable. No lo cuento como problema, pero tenelo listo para defenderlo.

---

### B16 · `metabuscar/route.js` sin `conErrores`

**Dónde:** `src/app/metabuscar/route.js:9`

Todas las demás rutas se envuelven con `conErrores` (`lib/http.js:6`), que atrapa cualquier excepción
y responde JSON. Esta no. Se apoya en el `try/catch` interno de `ejecutarMetabusqueda`
(`lib/metabuscar.js:10`), pero **`permitir()`, `ipDe()` y `leerJson()` corren afuera de ese catch**.

Si alguno tira, Next responde su HTML de error genérico en vez de tu `{ ok, resultados, error }`.
Del otro lado, `Buscador.js:45` hace `await r.json()` sobre ese HTML, falla, y el usuario termina
viendo "No pudimos conectar con el servidor" —un mensaje sobre la conexión cuando el problema fue del
servidor.

Probabilidad baja. El parche es envolver la ruta igual que las otras: una línea, y además te queda
consistente con el resto.

---

## GRAVEDAD BAJA

### B4 · `alert()` para los errores de favoritos

`src/components/Buscador.js:65` y `:72`. Bloquea el navegador, no se puede estilar, y rompe el patrón
que usás en todo el resto: el componente `Aviso` con `role="alert"` (`Buscador.js:8-15`), que es lo
correcto en accesibilidad. Dos lugares, mismo arreglo.

### B7 · El campo "Nombre" del registro no es obligatorio en el formulario

`src/components/DialogoAuth.js:36`:

```jsx
<label>Nombre <input name="nombre" maxLength={60} autoComplete="name" /></label>
```

Sin `required`, y el `<form>` tiene `noValidate` (`:33`). El servidor sí lo exige
(`api/auth/registro/route.js:19`). Resultado: el usuario manda el formulario vacío y recibe un error
del servidor que el navegador podía haber evitado. Comparalo con `email` y `password` de las líneas
siguientes, que sí llevan `required`.

### B8 · Enumeración de usuarios por tiempo de respuesta

`src/app/api/auth/login/route.js:18`:

```js
const ok = usuario && (await bcrypt.compare(password, usuario.passwordHash));
```

El cortocircuito es correcto en lógica pero mide distinto en tiempo: si el email **no** está
registrado, `bcrypt.compare` nunca corre y la respuesta vuelve en milisegundos. Si está, bcrypt trabaja
con coste 12 (`registro/route.js:24`), que son ~200-300 ms a propósito. La diferencia es medible desde
afuera: permite averiguar qué emails tienen cuenta.

El mensaje de error ya es correctamente genérico ("Email o contraseña incorrectos"), así que la fuga es
solo por tiempo. Para este proyecto es menor, pero es exactamente el tipo de detalle que luce si lo
mencionás vos primero en la defensa.

### B10 · `GET /api/favoritos` sin paginación, y se recarga entero en cada clic

`src/app/api/favoritos/route.js:20` trae todos los favoritos del usuario sin `take`/`skip`. Y
`Buscador.js:64` llama a `cargarFavoritos()` después de **cada** alta o baja, así que cada clic en el
corazón son dos viajes al servidor (el POST y el GET completo) antes de que la interfaz cambie.

Con 20 favoritos no se nota. Es la causa de que el corazón se sienta lento, y el arreglo —feedback
optimista— está en `02-FAVORITOS.md` como mejora F1.

### B12 · `const global = globalThis` en `db.js`

`src/lib/db.js:4`. Declara una constante llamada `global` que tapa la global de Node. **Funciona**
—es ámbito de módulo ESM— y el patrón de guardar el cliente Prisma entre recargas es el correcto. Pero
el nombre confunde al leerlo y se rompería si el archivo pasara a CommonJS. Cosmético.

### B13 · `.gitignore` con las reglas duplicadas

`.gitignore:1-6` y `:8-11` repiten `node_modules/`, `.next/` y `.env`. Sin efecto, solo prolijidad.
Se ve que hubo un merge a mano.

### B14 · `/metabuscar` queda fuera de `/api`

`src/app/metabuscar/route.js` vive en la raíz; todo el resto está bajo `/api/...`. Inconsistente.

**No lo muevas**: tocarlo significa cambiar la ruta, el `fetch` de `Buscador.js:44`, el README y los
tests, a cambio de cero funcionalidad. Es un detalle para reconocer si te lo marcan, no para arreglar
ahora. El README ya lo documenta como "único endpoint de búsqueda", que es una justificación válida.

### B15 · `no_cache=true` gasta un crédito en cada búsqueda

`src/servicios/serpapi.js:80`. Toda búsqueda es una llamada paga, sin caché de ningún tipo. El README
lo defiende como frescura (RNF-05) y **es una decisión legítima** para un metabuscador de precios:
un precio cacheado es un precio potencialmente falso.

El riesgo es operativo, no técnico: con el tope de 10/min/IP y el bypass de B9, una feria con varias
personas probando puede agotar la cuota. Si pasa, un caché de 5 minutos por (destino + fechas +
huéspedes) te salva sin mentirle al usuario. Tenelo pensado, no hace falta implementarlo.
