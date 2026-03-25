import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { useGestionAuth } from '../gestion/GestionAuthContext';
import '../gestion/gestion.css';

export default function Login() {
  const [form, setForm] = useState({ usuario: '', password: '' });
  const [error, setError] = useState('');
  const { login } = useGestionAuth();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.usuario === 'admin' && form.password === '1234') {
      login();
      navigate('/gestion/dashboard');
    } else {
      setError('Usuario o contraseña incorrectos');
    }
  };

  return (
    <div className="g-app g-login-page">
      <div className="g-login-card">
        <div className="g-login-logo">
          <Package size={44} color="#059669" />
          <h1>Panel de Gestión</h1>
          <p>Accede con tu cuenta</p>
        </div>

        {error && <div className="g-login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="g-field">
            <label className="g-label">Usuario</label>
            <input
              className="g-input"
              type="text"
              autoFocus
              autoComplete="username"
              value={form.usuario}
              onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
              placeholder="admin"
            />
          </div>
          <div className="g-field">
            <label className="g-label">Contraseña</label>
            <input
              className="g-input"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={e => {
                setForm(f => ({ ...f, password: e.target.value }));
                setError('');
              }}
              placeholder="••••••"
            />
          </div>
          <button type="submit" className="g-login-btn">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
