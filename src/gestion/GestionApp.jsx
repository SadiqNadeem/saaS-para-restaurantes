import { Routes, Route, Navigate } from 'react-router-dom';
import { GestionAuthProvider } from './GestionAuthContext';
import PrivateRoute from './PrivateRoute';
import NavLayout from './NavLayout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Productos from '../pages/Productos';
import Clientes from '../pages/Clientes';
import Pedidos from '../pages/Pedidos';
import Stock from '../pages/Stock';
import Facturacion from '../pages/Facturacion';

export default function GestionApp() {
  return (
    <GestionAuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />

        <Route
          element={
            <PrivateRoute>
              <NavLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<Dashboard />}   />
          <Route path="productos"   element={<Productos />}   />
          <Route path="clientes"    element={<Clientes />}    />
          <Route path="pedidos"     element={<Pedidos />}     />
          <Route path="stock"       element={<Stock />}       />
          <Route path="facturacion" element={<Facturacion />} />
        </Route>

        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </GestionAuthProvider>
  );
}
