import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { getProductos } from '../lib/api';

function StockBadge({ stock }) {
  if (stock === 0) return <span className="g-badge g-badge-red">0 — Sin stock</span>;
  if (stock < 10)  return <span className="g-badge g-badge-yellow">{stock} uds — Bajo</span>;
  return <span className="g-badge g-badge-green">{stock} uds</span>;
}

export default function Stock() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    getProductos().then(setProductos).finally(() => setLoading(false));
  }, []);

  const bajos     = productos.filter(p => p.stock < 10 && p.stock > 0);
  const sinStock  = productos.filter(p => p.stock === 0);
  const alertas   = bajos.length + sinStock.length;

  return (
    <div className="g-page">
      <h1 className="g-page-title">Control de Stock</h1>

      {!loading && alertas > 0 && (
        <div className="g-alert g-alert-warning">
          <AlertTriangle size={20} />
          <span>
            <strong>
              {sinStock.length > 0 && `${sinStock.length} sin stock`}
              {sinStock.length > 0 && bajos.length > 0 && ' · '}
              {bajos.length > 0 && `${bajos.length} con stock bajo`}
            </strong>
            {' '}— Revisa y repone los productos afectados
          </span>
        </div>
      )}

      {!loading && alertas === 0 && productos.length > 0 && (
        <div
          className="g-alert"
          style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', marginBottom: 20 }}
        >
          <CheckCircle size={20} />
          <span>Todo el stock está en niveles correctos</span>
        </div>
      )}

      <div className="g-card">
        {loading ? (
          <div className="g-loading">Cargando stock...</div>
        ) : productos.length === 0 ? (
          <div className="g-empty">No hay productos registrados.</div>
        ) : (
          <div className="g-table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Stock actual</th>
                </tr>
              </thead>
              <tbody>
                {[...productos].sort((a, b) => a.stock - b.stock).map(p => (
                  <tr
                    key={p.id}
                    style={{
                      background:
                        p.stock === 0 ? '#fff5f5' :
                        p.stock < 10  ? '#fffbeb' :
                        undefined,
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td><span className="g-badge g-badge-blue">{p.categoria}</span></td>
                    <td>{Number(p.precio).toFixed(2)} €</td>
                    <td><StockBadge stock={p.stock} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
