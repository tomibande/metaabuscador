'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/cliente';

// modo: null (cerrado) | 'login' | 'registro'
export default function DialogoAuth({ modo, onCambiarModo, onCerrar, onExito }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const registro = modo === 'registro';

  useEffect(() => {
    const d = ref.current;
    if (modo && !d.open) d.showModal();
    if (!modo && d.open) d.close();
    setError('');
  }, [modo]);

  async function enviar(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const datos = Object.fromEntries(new FormData(form));
    try {
      const r = await api(registro ? '/api/auth/registro' : '/api/auth/login', { method: 'POST', body: JSON.stringify(datos) });
      form.reset();
      await onExito(r.usuario);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <dialog ref={ref} onClose={onCerrar}>
      <form onSubmit={enviar}>
        <h2>{registro ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
        {registro && (
          <label>Nombre <input name="nombre" maxLength={60} autoComplete="name" required /></label>
        )}
        <label>Email <input name="email" type="email" maxLength={120} autoComplete="email" required /></label>
        <label>
          Contraseña
          <input name="password" type="password" minLength={8} maxLength={72} autoComplete={registro ? 'new-password' : 'current-password'} required />
        </label>
        <p className="error" role="alert">{error}</p>
        <div className="acciones">
          <button type="submit" className="primario">{registro ? 'Crear cuenta' : 'Entrar'}</button>
          <button type="button" className="enlace" onClick={() => onCambiarModo(registro ? 'login' : 'registro')}>
            {registro ? 'Ya tengo cuenta' : 'Crear una cuenta'}
          </button>
          <button type="button" className="enlace" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </dialog>
  );
}
