import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { getPedidos, getPedidoItems } from '../lib/api';

export default function Facturacion() {
  const [pedidos, setPedidos]         = useState([]);
  const [pedidoId, setPedidoId]       = useState('');
  const [items, setItems]             = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    getPedidos().then(data => {
      setPedidos(data);
      const pid = searchParams.get('pedidoId');
      if (pid) setPedidoId(pid);
    });
  }, []);

  useEffect(() => {
    if (!pedidoId) { setItems([]); return; }
    setLoadingItems(true);
    getPedidoItems(pedidoId)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoadingItems(false));
  }, [pedidoId]);

  const pedido   = pedidos.find(p => p.id === pedidoId);
  const subtotal = items.reduce((s, i) => s + Number(i.cantidad) * Number(i.precio_unitario), 0);
  const iva      = subtotal * 0.21;
  const total    = subtotal + iva;

  const formatFecha = (p) => {
    if (!p) return '—';
    if (p.fecha) return new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-ES');
    return new Date(p.created_at).toLocaleDateString('es-ES');
  };

  const generarPDF = () => {
    const doc = new jsPDF();
    let y = 20;

    // ── Título ─────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(15, 23, 42);
    doc.text('FACTURA', 105, y, { align: 'center' });
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Ref: #${pedidoId.slice(0, 8).toUpperCase()}`, 105, y, { align: 'center' });
    y += 16;

    // ── Línea divisoria ────────────────────────────────────────
    doc.setDrawColor(226, 232, 240);
    doc.line(20, y, 190, y);
    y += 10;

    // ── Datos ──────────────────────────────────────────────────
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.text(`Cliente: ${pedido?.clientes?.nombre || '—'}`, 20, y);
    doc.text(`Fecha: ${formatFecha(pedido)}`, 140, y);
    y += 7;
    doc.text(`Estado: ${pedido?.estado || '—'}`, 20, y);
    y += 14;

    // ── Cabecera tabla ─────────────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y - 5, 170, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('PRODUCTO', 22, y + 1);
    doc.text('CANT.', 110, y + 1);
    doc.text('PRECIO', 133, y + 1);
    doc.text('TOTAL', 165, y + 1);
    y += 11;

    // ── Filas ──────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);

    items.forEach(item => {
      const lineTotal = (Number(item.cantidad) * Number(item.precio_unitario)).toFixed(2);
      doc.text(item.productos?.nombre || '—', 22, y);
      doc.text(String(item.cantidad), 112, y);
      doc.text(`${Number(item.precio_unitario).toFixed(2)} €`, 131, y);
      doc.text(`${lineTotal} €`, 163, y);
      y += 9;

      doc.setDrawColor(241, 245, 249);
      doc.line(20, y - 3, 190, y - 3);
    });

    // ── Totales ────────────────────────────────────────────────
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.line(120, y, 190, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Subtotal:', 120, y);
    doc.text(`${subtotal.toFixed(2)} €`, 183, y, { align: 'right' });
    y += 8;
    doc.text('IVA (21%):', 120, y);
    doc.text(`${iva.toFixed(2)} €`, 183, y, { align: 'right' });
    y += 5;

    doc.setDrawColor(226, 232, 240);
    doc.line(120, y, 190, y);
    y += 9;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('TOTAL:', 120, y);
    doc.text(`${total.toFixed(2)} €`, 183, y, { align: 'right' });

    doc.save(`factura-${pedidoId.slice(0, 8)}.pdf`);
  };

  return (
    <div className="g-page">
      <h1 className="g-page-title">Facturación</h1>

      {/* Selector de pedido */}
      <div className="g-card" style={{ marginBottom: 24 }}>
        <div className="g-field" style={{ marginBottom: 0 }}>
          <label className="g-label">Seleccionar pedido</label>
          <select
            className="g-select"
            value={pedidoId}
            onChange={e => setPedidoId(e.target.value)}
          >
            <option value="">— Selecciona un pedido para ver la factura —</option>
            {pedidos.map(p => (
              <option key={p.id} value={p.id}>
                #{p.id.slice(0, 8).toUpperCase()} · {p.clientes?.nombre} · {formatFecha(p)} · {p.estado}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cargando items */}
      {loadingItems && <div className="g-loading">Cargando factura...</div>}

      {/* Factura */}
      {pedidoId && !loadingItems && items.length > 0 && (
        <>
          <div className="g-invoice">
            <div className="g-invoice-header">
              <div>
                <div className="g-invoice-title">FACTURA</div>
                <div className="g-invoice-ref">#{pedidoId.slice(0, 8).toUpperCase()}</div>
              </div>
              <div className="g-invoice-meta">
                <div><strong>Fecha:</strong> {formatFecha(pedido)}</div>
                <div><strong>Cliente:</strong> {pedido?.clientes?.nombre}</div>
                <div>
                  <strong>Estado: </strong>
                  <span className={`g-badge ${pedido?.estado === 'entregado' ? 'g-badge-green' : 'g-badge-yellow'}`}>
                    {pedido?.estado}
                  </span>
                </div>
              </div>
            </div>

            <div className="g-invoice-divider" />

            <div className="g-table-wrap">
              <table className="g-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio unit.</th>
                    <th>Total línea</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.productos?.nombre}</td>
                      <td>{item.cantidad}</td>
                      <td>{Number(item.precio_unitario).toFixed(2)} €</td>
                      <td style={{ fontWeight: 600 }}>
                        {(Number(item.cantidad) * Number(item.precio_unitario)).toFixed(2)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="g-invoice-divider" />

            <div className="g-invoice-totals">
              <div className="g-invoice-total-row">
                <span>Subtotal</span>
                <span>{subtotal.toFixed(2)} €</span>
              </div>
              <div className="g-invoice-total-row">
                <span>IVA (21%)</span>
                <span>{iva.toFixed(2)} €</span>
              </div>
              <div className="g-invoice-total-row main">
                <span>TOTAL</span>
                <span>{total.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
            <button
              className="g-btn g-btn-primary"
              style={{ padding: '13px 36px', fontSize: 16 }}
              onClick={generarPDF}
            >
              <Download size={18} /> Descargar PDF
            </button>
          </div>
        </>
      )}

      {/* Pedido sin items */}
      {pedidoId && !loadingItems && items.length === 0 && (
        <div className="g-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <FileText size={44} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: '#94a3b8', margin: 0 }}>Este pedido no tiene productos registrados.</p>
        </div>
      )}
    </div>
  );
}
