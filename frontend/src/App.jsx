import { createContext, useContext, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { session } from "./api";
import { disconnectLive } from "./live";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LiveView from "./pages/LiveView";
import Alerts from "./pages/Alerts";
import History from "./pages/History";
import Reports from "./pages/Reports";
import Persons from "./pages/Persons";
import Cameras from "./pages/Cameras";
import Users from "./pages/Users";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(session.user);
  const login = (token, u) => { session.save(token, u); setUser(u); };
  const logout = () => { session.clear(); disconnectLive(); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<RequireRole><Layout /></RequireRole>}>
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveView />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="history" element={<History />} />
          <Route path="reports" element={<RequireRole roles={["admin", "executive"]}><Reports /></RequireRole>} />
          <Route path="persons" element={<RequireRole roles={["admin", "executive"]}><Persons /></RequireRole>} />
          <Route path="cameras" element={<RequireRole roles={["admin"]}><Cameras /></RequireRole>} />
          <Route path="users" element={<RequireRole roles={["admin"]}><Users /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthCtx.Provider>
  );
}
