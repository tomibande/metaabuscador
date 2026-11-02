# Para la defensa

El README ya tiene una sección "Decisiones para defender en la evaluación" y está bien. Esto la
complementa con las preguntas incómodas —las que salen de lo que encontré en la auditoría— y cómo
responderlas sin quedar mal.

La regla general: **lo que reconocés vos primero deja de ser un hallazgo del evaluador.** Un límite que
explicás con su motivo suena a criterio; el mismo límite descubierto por otro suena a descuido.

---

### "¿Esto de Gemini y Tavily qué hace?"

La peor respuesta es "nada, quedó". La buena:

> Probamos dos arquitecturas. La primera buscaba en la web con Tavily y usaba Gemini para estructurar
> el texto crudo. La reemplazamos por SerpApi sobre Google Hotels porque devuelve datos ya
> estructurados: tarifa por noche verificable y lista de comodidades, sin que un modelo tenga que
> inferir nada. Eliminamos un punto de falla y una fuente de datos inventados.

Y si ya aplicaste la Opción 1 de B6, podés cerrar con "por eso ese código no está más en el repo".
Si no, decí dónde está y que está archivado a propósito.

### "¿Por qué el límite de búsquedas vive en memoria?"

> Porque cada búsqueda cuesta un crédito de SerpApi y el objetivo era frenar el abuso accidental, no
> montar infraestructura. Sabemos que se reinicia con el servidor y que no se comparte entre
> instancias; para un despliegue real iría a Redis. Para esta entrega, con una instancia, alcanza.

Está escrito así en el comentario de `lib/limitador.js:1-2`, lo cual juega a tu favor: muestra que fue
una decisión consciente y no un olvido.

### "¿Y si alguien falsea el header de la IP?"

Esta te la pueden hacer si leen el código (es B9). Reconocela:

> `x-forwarded-for` lo manda el cliente, así que detrás de un proxy que no lo reescriba el límite se
> puede evadir cambiando el header. En producción se resuelve confiando solo en el proxy propio.
> Lo tenemos identificado; no lo arreglamos porque el límite acá es de contención de costos, no una
> defensa de seguridad.

### "¿Por qué los precios no se cachean?"

> Porque un precio cacheado es un precio potencialmente falso, y el valor de un metabuscador es que el
> número sea el de ahora. Por eso va `no_cache=true` y `cache: 'no-store'`. El costo es un crédito por
> búsqueda, y por eso existe el límite de 10 por minuto por IP.

Es una decisión buena y bien fundada. Si te aprietan con el costo, el siguiente paso es un caché corto
de 5 minutos por (destino + fechas + huéspedes), que no miente y corta el gasto repetido.

### "¿Cómo garantizan que los precios no son inventados?"

Esta es tu respuesta más fuerte y conviene tenerla lista:

> No los generamos: los descartamos. `serpapi.js:34-43` rechaza toda propiedad sin
> `rate_per_night.extracted_lowest` numérico. Si Google Hotels no da tarifa comprobable, el
> alojamiento no aparece. Preferimos mostrar menos resultados que mostrar un precio que no podemos
> sostener.

Mostrá esas líneas en pantalla si podés. Es el punto donde el proyecto se ve más sólido.

### "¿Qué pasa si se cae SerpApi?"

> `lib/metabuscar.js:13-19` lo atrapa y devuelve 502 con un mensaje para humanos, siempre en el mismo
> formato `{ ok, resultados, error }`. El frontend lo muestra como un aviso y la aplicación sigue
> funcionando: los favoritos y la sesión no dependen de SerpApi.

### "¿Un usuario puede ver o borrar los favoritos de otro?"

> No. Los tres endpoints empiezan resolviendo el usuario del JWT de la cookie, y el borrado
> (`api/favoritos/[id]/route.js:12`) filtra por `id` **y** por `idUsuario` a la vez, así que pasar un
> id ajeno no borra nada. La cookie es `httpOnly`, así que el JavaScript de la página no puede leer el
> token.

### "¿Y el CSRF?"

> La cookie es `sameSite: 'lax'`, que no se manda en POST desde otro sitio. Eso cubre las altas y las
> bajas de favoritos y el login.

### "¿Cómo guardan las contraseñas?"

> bcrypt con coste 12 (`api/auth/registro/route.js:24`). Nunca se guarda ni se loguea la contraseña en
> claro, y el error de login es genérico a propósito ("Email o contraseña incorrectos") para no
> revelar qué emails están registrados.

Si querés sumar puntos, agregá vos mismo el matiz de B8:

> Queda una fuga menor por tiempo de respuesta: si el email no existe, bcrypt no corre y la respuesta
> vuelve más rápido. Se tapa comparando siempre contra un hash de descarte. Lo tenemos identificado.

---

## Los dos temas donde conviene que te adelantes

**1. El bug de las fechas (B1).** Si durante la demo alguien prueba buscar para hoy, falla. Dos
caminos: arreglalo antes (el parche es una línea y está verificado), o si no llegás, no busques para
hoy en la demo y tené la explicación lista. Arreglarlo es más barato que esquivarlo.

**2. Los favoritos duplicados (B2 / P1).** Es el más fácil de encontrar por accidente: basta guardar un
hotel, cambiar las fechas, buscar de nuevo y ver que el corazón está vacío. Si no lo arreglás, al menos
sabé explicarlo:

> La clave única del favorito es la URL de la oferta, y el enlace de Google Hotels incluye las fechas,
> así que el mismo hotel con otras fechas entra como registro nuevo. La solución es una identidad
> propia del alojamiento (nombre normalizado + destino) en vez de la URL.

Que lo expliques con la causa exacta y la solución cambia por completo cómo se lee: es la diferencia
entre un bug que no entendés y una deuda técnica que identificaste.

---

## Si te preguntan qué harías con más tiempo

Tres respuestas, de menor a mayor ambición. Salen de `02-FAVORITOS.md`:

1. **Guardar el contexto de la búsqueda en el favorito** (moneda, fechas, huéspedes). Hoy el favorito
   guarda un precio sin decir de qué noches ni en qué moneda.
2. **Comparar el precio guardado con el actual**: "bajó US$12 desde que lo guardaste". Es lo que
   convierte la lista de favoritos en algo que un marcador del navegador no puede hacer.
3. **Alertas de bajada de precio** por email, sobre lo anterior.

La número 2 es la que mejor muestra que entendiste para qué sirve un metabuscador.
