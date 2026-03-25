import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Check, FileText, X, Trash2, ArrowLeft } from 'lucide-react';
import {
  getPedidos,
  getPedidosByCliente,
  getClientes,
  getProductos,
  addPedido,
  updateEstadoPedido,
} from '../lib/api';

const emptyRow = () => ({ producto_id: '', cantidad: 1, precio_unitario: 0 });

export default function Pedidos() {
  const [pedidos, setPedidos]     = useState([]);
  const [clientes, setClientes]   = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [rows, setRows]           = useState([emptyRow()]);
  const [saving, setSaving]       = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filtroClienteId = searchParams.get('cliente_id');
  const filtroNombre    = clientes.find(c => c.id === filtroClienteId)?.nombre;

  const load = async () => {
    setLoading(true);
    try {
      const data = filtroClienteId
        ? await getPedidosByCliente(filtroClienteId)
        : await getPedidos();
      setPedidos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getClientes().then(setClientes);
    getProductos().then(setProductos);
  }, [filtroClienteId]);

  // Rellena precio automáticamente al seleccionar producto
  const handleRowChange = (index, field, value) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'producto_id') {
        const prod = productos.find(p => p.id === value);
        next[index].precio_unitario = prod ? Number(prod.precio) : 0;
      }
      return next;
    });
  };

  const total = rows.reduce(
    (sum, r) => sum + Number(r.precio_unitario) * Number(r.cantidad),
    0
  );

  const openModal = () => {
    setClienteId('');
    setRows([emptyRow()]);
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validRows = rows.filter(r => r.producto_id);
    if (!clienteId)           return alert('Selecciona un cliente');
    if (validRows.length === 0) return alert('Añade al menos un producto');

    setSaving(true);
    try {
      await addPedido(
        { cliente_id: clienteId },
        validRows.map(r => ({
          producto_id:     r.producto_id,
          cantidad:        Number(r.cantidad),
          precio_unitario: Number(r.precio_unitario),
        }))
      );
      setModal(false);
      load();
    } catch (err) {
      alert('Error al crear el pedido: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEntregado = async (id) => {
    try {
      await updateEstadoPedido(id, 'entregado');
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: 'entregado' } : p));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="g-page">
      <div className="g-section-header">
        <div>
          <h1 className="g-page-title" style={{ margin: 0 }}>
            {filtroClienteId ? `Pedidos de ${filtroNombre || '...'}` : 'Pedidos'}
          </h1>
          {filtroClienteId && (
            <button
              style={{
                marginTop: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#059669',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 0,
              }}
              onClick={() => navigate('/gestion/pedidos')}
            >
              <ArrowLeft size={14} /> Ver todos los pedidos
            </button>
          )}
        </div>
        <button className="g-btn g-btn-primary" onClick={openModal}>
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      <div className="g-card">
        {loading ? (
          <div className="g-loading">Cargando pedidos...</div>
        ) : pedidos.length === 0 ? (
          <div className="g-empty">No hay pedidos registrados.</div>
        ) : (
          <div className="g-table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                        #{p.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.clientes?.nombre || '—'}</td>
                    <td>
                      {p.fecha
                        ? new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-ES')
                        : new Date(p.created_at).toLocaleDateString('es-ES')}
                    </td>
                    <td>
                      <span className={`g-badge ${p.estado === 'entregado' ? 'g-badge-green' : 'g-badge-yellow'}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {p.estado === 'pendiente' && (
                          <button
                            className="g-btn g-btn-success g-btn-sm"
                            onClick={() => handleEntregado(p.id)}
                          >
                            <Check size={14} /> Entregar
                          </button>
                        )}
                        <button
                          className="g-btn g-btn-secondary g-btn-sm"
                          onClick={() => navigate(`/gestion/facturacion?pedidoId=${p.id}`)}
                        >
                          <FileText size={14} /> Factura
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="g-modal-overlay" onClick={() => setModal(false)}>
          <div className="g-modal g-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="g-modal-header">
              <span className="g-modal-title">Nuevo pedido</span>
              <button className="g-modal-close" onClick={() => setModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="g-modal-body">
                {/* Cliente */}
                <div className="g-field">
                  <label className="g-label">Cliente *</label>
                  <select
                    className="g-select"
                    value={clienteId}
                    onChange={e => setClienteId(e.target.value)}
                    required
                  >
                    <option value="">— Seleccionar cliente —</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Productos */}
                <div className="g-field" style={{ marginBottom: 0 }}>
                  <label className="g-label">Líneas de pedido</label>

                  <div className="g-item-row-header">
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Producto</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Cant.</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Precio €</span>
                    <span></span>
                  </div>

                  {rows.map((row, i) => (
                    <div key={i} className="g-item-row">
                      <select
                        className="g-select"
                        value={row.producto_id}
                        onChange={e => handleRowChange(i, 'producto_id', e.target.value)}
                      >
                        <option value="">— Producto —</option>
                        {productos.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>

                      <input
                        className="g-input"
                        type="number"
                        min="1"
                        value={row.cantidad}
                        onChange={e => handleRowChange(i, 'cantidad', e.target.value)}
                      />

                      <input
                        className="g-input"
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.precio_unitario}
                        onChange={e => handleRowChange(i, 'precio_unitario', e.target.value)}
                      />

                      <button
                        type="button"
                        className="g-remove-btn"
                        disabled={rows.length === 1}
                        onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="g-btn g-btn-secondary g-btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => setRows(prev => [...prev, emptyRow()])}
                  >
                    <Plus size={14} /> Añadir línea
                  </button>

                  <div className="g-item-row-total">
                    Total estimado: <strong>{total.toFixed(2)} €</strong>
                  </div>
                </div>
              </div>

              <div className="g-modal-footer">
                <button type="button" className="g-btn g-btn-secondary" onClick={() => setModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="g-btn g-btn-primary" disabled={saving}>
                  {saving ? 'Creando pedido...' : 'Crear pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
