import { createContext, useContext, useState } from 'react';

const GestionAuthContext = createContext(null);

export function GestionAuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('g_auth') === 'true'
  );

  const login = () => {
    localStorage.setItem('g_auth', 'true');
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('g_auth');
    setIsAuthenticated(false);
  };

  return (
    <GestionAuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </GestionAuthContext.Provider>
  );
}

export function useGestionAuth() {
  return useContext(GestionAuthContext);
}
