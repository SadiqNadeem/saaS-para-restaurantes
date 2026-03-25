import { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { getProductos, addProducto, deleteProducto } from '../lib/api';

function StockBadge({ stock }) {
  if (stock === 0)  return <span className="g-badge g-badge-red">Sin stock</span>;
  if (stock < 10)   return <span className="g-badge g-badge-yellow">{stock} uds</span>;
  return <span className="g-badge g-badge-green">{stock} uds</span>;
}

const emptyForm = { nombre: '', categoria: 'Bolsas', precio: '', stock: '0' };

export default function Productos() {
  const [productos, setProductos]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [form, setForm]               = useState(emptyForm);
  const [saving, setSaving]           = useState(false);

  const load = () => {
    setLoading(true);
    getProductos().then(setProductos).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal  = () => { setForm(emptyForm); setModal(true); };
  const closeModal = () => setModal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addProducto({
        nombre:    form.nombre,
        categoria: form.categoria,
        precio:    Number(form.precio),
        stock:     Number(form.stock),
      });
      closeModal();
      load();
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, nombre) => {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return;
    try {
      await deleteProducto(id);
      setProductos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  return (
    <div className="g-page">
      <div className="g-section-header">
        <h1 className="g-page-title" style={{ margin: 0 }}>Productos</h1>
        <button className="g-btn g-btn-primary" onClick={openModal}>
          <Plus size={16} /> Añadir producto
        </button>
      </div>

      <div className="g-card">
        {loading ? (
          <div className="g-loading">Cargando productos...</div>
        ) : productos.length === 0 ? (
          <div className="g-empty">No hay productos. Añade el primero.</div>
        ) : (
          <div className="g-table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {productos.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td><span className="g-badge g-badge-blue">{p.categoria}</span></td>
                    <td>{Number(p.precio).toFixed(2)} €</td>
                    <td><StockBadge stock={p.stock} /></td>
                    <td>
                      <button
                        className="g-btn g-btn-danger g-btn-sm"
                        onClick={() => handleDelete(p.id, p.nombre)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="g-modal-overlay" onClick={closeModal}>
          <div className="g-modal" onClick={e => e.stopPropagation()}>
            <div className="g-modal-header">
              <span className="g-modal-title">Nuevo producto</span>
              <button className="g-modal-close" onClick={closeModal}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="g-modal-body">
                <div className="g-field">
                  <label className="g-label">Nombre *</label>
                  <input
                    className="g-input"
                    required
                    autoFocus
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Nombre del producto"
                  />
                </div>

                <div className="g-row-2">
                  <div className="g-field">
                    <label className="g-label">Categoría</label>
                    <select
                      className="g-select"
                      value={form.categoria}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    >
                      <option>Bolsas</option>
                      <option>Film</option>
                      <option>Embalaje</option>
                    </select>
                  </div>
                  <div className="g-field">
                    <label className="g-label">Precio (€) *</label>
                    <input
                      className="g-input"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={form.precio}
                      onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="g-field" style={{ marginBottom: 0 }}>
                  <label className="g-label">Stock inicial</label>
                  <input
                    className="g-input"
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                  />
                </div>
              </div>

              <div className="g-modal-footer">
                <button type="button" className="g-btn g-btn-secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="g-btn g-btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
