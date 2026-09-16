import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthContext, useAuthProvider } from './hooks/useAuth'
import { useFontScale } from './hooks/useFontScale'
import { MonitorTopbar }   from './components/MonitorTopbar'
import { Login }           from './pages/Login'
import { Dashboard }       from './pages/Dashboard'
import { Incidentes }      from './pages/Incidentes'
import { ReporteSLA }      from './pages/ReporteSLA'
import { Reportes }        from './pages/Reportes'
import { Discrepancias }   from './pages/Discrepancias'
import { AdminLayout }       from './pages/admin/AdminLayout'
import { AdminDashboard }    from './pages/admin/AdminDashboard'
import { AdminEstaciones }   from './pages/admin/Estaciones'
import { AdminVias }         from './pages/admin/Vias'
import { AdminEquipos }      from './pages/admin/Equipos'
import { AdminTiposEquipo }  from './pages/admin/TiposEquipo'
import { AdminMantenimiento } from './pages/admin/Mantenimiento'
import { AdminServicios }     from './pages/admin/Servicios'
import { AdminServicioChecks } from './pages/admin/ServicioChecks'
import { AdminUsuarios }     from './pages/admin/Usuarios'
import { AdminConfiguracion } from './pages/admin/Configuracion'
import { NocDashboard }       from './pages/NocDashboard'
import { NocMuro }            from './pages/NocMuro'
import { OcrDashboard }       from './pages/OcrDashboard'

function AppLayout() {
  useFontScale()
  return (
    <>
      <MonitorTopbar signalStatus="ok" />
      <Routes>
        <Route path="/"           element={<Dashboard />} />
        <Route path="/noc"        element={<NocDashboard />} />
        <Route path="/admin"      element={<AdminLayout />}>
          <Route index              element={<AdminDashboard />} />
          <Route path="estaciones"  element={<AdminEstaciones />} />
          <Route path="vias"        element={<AdminVias />} />
          <Route path="equipos"     element={<AdminEquipos />} />
          <Route path="tipos-equipo" element={<AdminTiposEquipo />} />
          <Route path="mantenimiento" element={<AdminMantenimiento />} />
          <Route path="servicios"     element={<AdminServicios />} />
          <Route path="servicio-checks" element={<AdminServicioChecks />} />
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

  // Pantallas "muro" — lienzo propio a 1920×1080 escalado (ScaledStage) con su
  // propio topbar (WallTopbar), sin el AppLayout/MonitorTopbar de siempre.
  const muro = (el: JSX.Element) => auth.user ? el : <Navigate to="/login" replace />

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/login" element={
          auth.user ? <Navigate to="/" replace /> : <Login />
        } />
        <Route path="/muro/noc"        element={muro(<NocMuro />)} />
        <Route path="/incidentes"      element={muro(<Incidentes />)} />
        <Route path="/reporte"         element={muro(<ReporteSLA />)} />
        <Route path="/reportes"        element={muro(<Reportes />)} />
        <Route path="/discrepancias"   element={muro(<Discrepancias />)} />
        <Route path="/ocr"             element={muro(<OcrDashboard />)} />
        <Route path="/*" element={
          auth.user ? <AppLayout /> : <Navigate to="/login" replace />
        } />
      </Routes>
    </AuthContext.Provider>
  )
}
