import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Users, ShoppingCart, AlertTriangle, BarChart2, FileText } from 'lucide-react';
import { getProductos, getClientes, getPedidos, getStockBajo } from '../lib/api';

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    productos: 0,
    clientes: 0,
    pedidosPendientes: 0,
    stockBajo: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProductos(), getClientes(), getPedidos(), getStockBajo()])
      .then(([productos, clientes, pedidos, stockBajo]) => {
        setMetrics({
          productos: productos.length,
          clientes: clientes.length,
          pedidosPendientes: pedidos.filter(p => p.estado === 'pendiente').length,
          stockBajo: stockBajo.length,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const metricCards = [
    {
      icon: <Package size={26} color="#059669" />,
      value: metrics.productos,
      label: 'Total productos',
    },
    {
      icon: <Users size={26} color="#2563eb" />,
      value: metrics.clientes,
      label: 'Total clientes',
    },
    {
      icon: <ShoppingCart size={26} color="#d97706" />,
      value: metrics.pedidosPendientes,
      label: 'Pedidos pendientes',
    },
    {
      icon: <AlertTriangle size={26} color={metrics.stockBajo > 0 ? '#dc2626' : '#059669'} />,
      value: metrics.stockBajo,
      label: 'Alertas de stock',
    },
  ];

  const navButtons = [
    { to: '/gestion/productos',   icon: <Package size={34} />,      label: 'Productos'   },
    { to: '/gestion/clientes',    icon: <Users size={34} />,         label: 'Clientes'    },
    { to: '/gestion/pedidos',     icon: <ShoppingCart size={34} />,  label: 'Pedidos'     },
    { to: '/gestion/stock',       icon: <BarChart2 size={34} />,     label: 'Stock'       },
    { to: '/gestion/facturacion', icon: <FileText size={34} />,      label: 'Facturación' },
  ];

  if (loading) {
    return (
      <div className="g-page">
        <h1 className="g-page-title">Dashboard</h1>
        <div className="g-loading">Cargando datos...</div>
      </div>
    );
  }

  return (
    <div className="g-page">
      <h1 className="g-page-title">Dashboard</h1>

      <div className="g-metrics">
        {metricCards.map((m, i) => (
          <div key={i} className="g-metric">
            <div className="g-metric-icon">{m.icon}</div>
            <div className="g-metric-value">{m.value}</div>
            <div className="g-metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="g-nav-buttons">
        {navButtons.map(btn => (
          <Link key={btn.to} to={btn.to} className="g-nav-btn">
            {btn.icon}
            {btn.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
