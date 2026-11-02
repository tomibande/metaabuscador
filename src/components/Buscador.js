'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/cliente';
import FormularioBusqueda from './FormularioBusqueda';
import DialogoAuth from './DialogoAuth';
import { TarjetaResultado, TarjetaFavorito } from './Tarjeta';

function Aviso({ titulo, texto, error = false }) {
  return (
    <div className={`aviso ${error ? 'es-error' : ''}`} role={error ? 'alert' : 'status'}>
      <h3>{titulo}</h3>
      <p>{texto}</p>
    </div>
  );
}

export default function Buscador() {
  const [usuario, setUsuario] = useState(null);
  const [favoritos, setFavoritos] = useState([]);
  const [vista, setVista] = useState('busqueda'); // busqueda | favoritos
  const [estado, setEstado] = useState('inicio'); // inicio | cargando | resultados | vacio | error
  const [resultados, setResultados] = useState([]);
  const [mensajeError, setMensajeError] = useState('');
  const [auth, setAuth] = useState(null); // null | 'login' | 'registro'
  const [avisoFav, setAvisoFav] = useState(''); // errores de favoritos, en vez de alert()

  async function cargarFavoritos() {
    setFavoritos((await api('/api/favoritos')).favoritos);
  }

  // Al abrir la página, se restaura la sesión si existe
  useEffect(() => {
    (async () => {
      try {
        setUsuario((await api('/api/auth/yo')).usuario);
        await cargarFavoritos();
      } catch { /* sin sesión */ }
    })();
  }, []);

  async function buscar(cuerpo) {
    setVista('busqueda');
    setEstado('cargando');
    try {
      const r = await fetch('/metabuscar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const datos = await r.json();
      if (!datos.ok) {
        setMensajeError(datos.error || 'Error inesperado.');
        return setEstado('error');
      }
      setResultados(datos.resultados);
      setEstado(datos.resultados.length ? 'resultados' : 'vacio');
    } catch {
      setMensajeError('No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
      setEstado('error');
    }
  }

  // La cookie dura 7 días. Si venció con la página abierta, el estado de React todavía cree
  // que hay sesión y el pedido vuelve 401: antes eso moría en un alert() sin salida.
  function manejarErrorFavorito(e) {
    if (e.status === 401) {
      setUsuario(null);
      setFavoritos([]);
      setVista('busqueda');
      setAvisoFav('Tu sesión venció. Iniciá sesión de nuevo para guardar alojamientos.');
      return setAuth('login');
    }
    setAvisoFav(e.message);
  }

  async function alternarFavorito(r) {
    if (!usuario) return setAuth('login');
    const existente = favoritos.find((f) => f.urlOrigen === r.url);
    setAvisoFav('');
    try {
      if (existente) await api(`/api/favoritos/${existente.id}`, { method: 'DELETE' });
      else await api('/api/favoritos', { method: 'POST', body: JSON.stringify({ nombre: r.nombre, precio: r.precioNumero, url: r.url, imagen: r.imagen }) });
      await cargarFavoritos();
    } catch (e) { manejarErrorFavorito(e); }
  }

  async function quitarFavorito(f) {
    setAvisoFav('');
    try {
      await api(`/api/favoritos/${f.id}`, { method: 'DELETE' });
      await cargarFavoritos();
    } catch (e) { manejarErrorFavorito(e); }
  }

  async function salir() {
    await api('/api/auth/logout', { method: 'POST' });
    setUsuario(null);
    setFavoritos([]);
    setVista('busqueda');
    setAvisoFav('');
  }

  async function alIniciarSesion(u) {
    setUsuario(u);
    setAvisoFav('');
    await cargarFavoritos();
    setAuth(null);
  }

  function panel() {
    if (vista === 'favoritos') {
      if (!favoritos.length) return <Aviso titulo="Todavía no guardaste alojamientos" texto='Buscá un destino y tocá "Guardar" en las ofertas que te gusten.' />;
      return <ul className="lista">{favoritos.map((f) => <TarjetaFavorito key={f.id} f={f} onQuitar={() => quitarFavorito(f)} />)}</ul>;
    }
    switch (estado) {
      case 'cargando':
        return <div className="lista" aria-busy="true"><div className="esqueleto" /><div className="esqueleto" /><div className="esqueleto" /></div>;
      case 'resultados':
        return (
          <ul className="lista">
            {resultados.map((r) => (
              <TarjetaResultado key={r.url} r={r} esFavorito={favoritos.some((f) => f.urlOrigen === r.url)} onFavorito={() => alternarFavorito(r)} />
            ))}
          </ul>
        );
      case 'vacio':
        return <Aviso titulo="Sin resultados" texto="No encontramos alojamientos con esos filtros. Probá ampliar el precio o quitar algún servicio." />;
      case 'error':
        return <Aviso titulo="No pudimos buscar" texto={mensajeError} error />;
      default:
        return <Aviso titulo="Empezá tu búsqueda" texto="Elegí un destino y los filtros que necesites. Te mostramos ofertas reales de otros sitios." />;
    }
  }

  return (
    <>
      <header className="barra">
        <a className="marca" href="/">ICLUD</a>
        <nav className="cuenta">
          {usuario ? (
            <>
              <span>Hola, {usuario.nombre}</span>
              <button className="enlace" onClick={salir}>Cerrar sesión</button>
            </>
          ) : (
            <button className="enlace" onClick={() => setAuth('login')}>Iniciar sesión</button>
          )}
        </nav>
      </header>

      <main className="layout">
        <FormularioBusqueda onBuscar={buscar} cargando={estado === 'cargando'} />

        <section className="panel" aria-live="polite">
          <div className="panel-cab">
            <h2>{vista === 'favoritos' ? 'Mis favoritos' : 'Resultados'}</h2>
            {usuario && (
              <button className="enlace" onClick={() => setVista(vista === 'favoritos' ? 'busqueda' : 'favoritos')}>
                {vista === 'favoritos' ? 'Volver a la búsqueda' : `Ver mis favoritos (${favoritos.length})`}
              </button>
            )}
          </div>
          {avisoFav && <p className="error" role="alert">{avisoFav}</p>}
          {panel()}
        </section>
      </main>

      <DialogoAuth modo={auth} onCambiarModo={setAuth} onCerrar={() => setAuth(null)} onExito={alIniciarSesion} />
    </>
  );
}
