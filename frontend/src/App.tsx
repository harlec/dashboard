import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthContext, useAuthProvider } from './hooks/useAuth'
import { NavBar }     from './components/NavBar'
import { Login }      from './pages/Login'
import { Dashboard }  from './pages/Dashboard'
import { Incidentes } from './pages/Incidentes'
import { ReporteSLA } from './pages/ReporteSLA'
import { AdminLayout }       from './pages/admin/AdminLayout'
import { AdminDashboard }    from './pages/admin/AdminDashboard'
import { AdminEstaciones }   from './pages/admin/Estaciones'
import { AdminVias }         from './pages/admin/Vias'
import { AdminEquipos }      from './pages/admin/Equipos'
import { AdminUsuarios }     from './pages/admin/Usuarios'
import { AdminConfiguracion } from './pages/admin/Configuracion'

function AppLayout() {
  return (
    <>
      <NavBar signalStatus="ok" />
      <Routes>
        <Route path="/"           element={<Dashboard />} />
        <Route path="/incidentes" element={<Incidentes />} />
        <Route path="/reporte"    element={<ReporteSLA />} />
        <Route path="/admin"      element={<AdminLayout />}>
          <Route index              element={<AdminDashboard />} />
          <Route path="estaciones"  element={<AdminEstaciones />} />
          <Route path="vias"        element={<AdminVias />} />
          <Route path="equipos"     element={<AdminEquipos />} />
          <Route path="usuarios"    element={<AdminUsuarios />} />
          <Route path="config"      element={<AdminConfiguracion />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  const auth = useAuthProvider()

  if (auth.loading) return (
    <div className="flex items-center justify-center min-h-screen text-muted">Cargando…</div>
  )

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/login" element={
          auth.user ? <Navigate to="/" replace /> : <Login />
        } />
        <Route path="/*" element={
          auth.user ? <AppLayout /> : <Navigate to="/login" replace />
        } />
      </Routes>
    </AuthContext.Provider>
  )
}
