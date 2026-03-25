import { Navigate } from 'react-router-dom';
import { useGestionAuth } from './GestionAuthContext';

export default function PrivateRoute({ children }) {
  const { isAuthenticated } = useGestionAuth();
  return isAuthenticated ? children : <Navigate to="/gestion/login" replace />;
}
