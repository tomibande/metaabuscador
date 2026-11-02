// POST /metabuscar: único endpoint de búsqueda que consume el frontend.
import { json, leerJson } from '@/lib/http';
import { permitir, ipDe } from '@/lib/limitador';
import { ejecutarMetabusqueda } from '@/lib/metabuscar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// permitir(), ipDe() y leerJson() corren fuera del try/catch de ejecutarMetabusqueda,
// así que un fallo ahí devolvía el HTML de error de Next en vez del shape { ok, resultados, error }.
export async function POST(request) {
  try {
    return await manejar(request);
  } catch (e) {
    console.error('Fallo inesperado en /metabuscar:', e);
    return json({ ok: false, resultados: [], error: 'Error interno del servidor.' }, 500);
  }
}

async function manejar(request) {
  if (!permitir(`busqueda:${ipDe(request)}`, { limite: 10, ventanaMs: 60_000 })) {
    return json({ ok: false, resultados: [], error: 'Demasiadas búsquedas seguidas. Esperá un minuto.' }, 429);
  }

  const faltan = ['SERPAPI_API_KEY'].filter((k) => !process.env[k]?.trim());
  if (faltan.length) {
    console.error(`Faltan variables en .env: ${faltan.join(', ')}`);
    return json({
      ok: false,
      resultados: [],
      error: 'Falta configurar SERPAPI_API_KEY en .env. Creá una clave en serpapi.com y reiniciá el servidor.',
    }, 500);
  }

  const { status, cuerpo } = await ejecutarMetabusqueda(await leerJson(request));
  return json(cuerpo, status);
}
