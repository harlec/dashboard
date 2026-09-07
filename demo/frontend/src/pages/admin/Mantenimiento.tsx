import { useEffect, useState } from 'react'
import { api, type Mantenimiento } from '../../api/client'
import { AdminTable } from '../../components/admin/AdminTable'
import { Field, Input, Select } from '../../components/admin/FormModal'

interface Estacion { id: number; nombre: string }
interface Via { id: number; numero: string; estacion?: { id: number; nombre: string } }
interface Equipo { id: number; nombre: string; via?: { estacion?: { nombre: string } } }

type Alcance = 'estacion' | 'via' | 'equipo'

function fmt(s: string) {
  return new Date(s).toLocaleString('es-PE', { hour12: false })
}

export function AdminMantenimiento() {
  const [rows,       setRows]       = useState<Mantenimiento[]>([])
  const [estaciones, setEstaciones] = useState<Estacion[]>([])
  const [vias,       setVias]       = useState<Via[]>([])
  const [equipos,    setEquipos]    = useState<Equipo[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const [alcance,    setAlcance]    = useState<Alcance>('estacion')
  const [scopeId,    setScopeId]    = useState<number | ''>('')
  const [horas,      setHoras]      = useState(2)
  const [motivo,     setMotivo]     = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.mantenimientos(false),
      fetch('/api/estaciones', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/vias', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/equipos', { credentials: 'include' }).then(r => r.json()),
    ]).then(([m, e, v, eq]) => { setRows(m); setEstaciones(e); setVias(v); setEquipos(eq) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const ahora = () => new Date()
  const activo = (m: Mantenimiento) => new Date(m.hasta) > ahora() && new Date(m.desde) <= ahora()

  const crear = async () => {
    if (!scopeId) { setError('Selecciona a qué aplica'); return }
    if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
    setError(''); setSaving(true)
    try {
      await api.crearMantenimiento({
        estacionId: alcance === 'estacion' ? Number(scopeId) : undefined,
        viaId:      alcance === 'via'      ? Number(scopeId) : undefined,
        equipoId:   alcance === 'equipo'   ? Number(scopeId) : undefined,
        horas, motivo,
      })
      setScopeId(''); setMotivo(''); setHoras(2)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  const terminar = async (m: Mantenimiento) => {
    if (!confirm(`¿Terminar el mantenimiento "${m.motivo}" ahora?`)) return
    await api.terminarMantenimiento(m.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Modo Mantenimiento</h1>
      </div>
      <p className="text-sm text-muted mb-4 max-w-2xl">
        Mientras un peaje, vía o equipo esté en mantenimiento, los incidentes que se abran ahí se etiquetan
        solos como "Mantenimiento" (no afectan el % de disponibilidad) y no se envían alertas de Telegram,
        correo ni sonido.
      </p>

      {/* Formulario nuevo */}
      <div className="bg-surface rounded-xl border border-border p-4 mb-5 max-w-2xl">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Aplica a">
            <Select value={alcance} onChange={e => { setAlcance(e.target.value as Alcance); setScopeId('') }}>
              <option value="estacion">Peaje completo</option>
              <option value="via">Una vía</option>
              <option value="equipo">Un equipo</option>
            </Select>
          </Field>
          <Field label={alcance === 'estacion' ? 'Peaje' : alcance === 'via' ? 'Vía' : 'Equipo'}>
            <Select value={scopeId} onChange={e => setScopeId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Seleccionar…</option>
              {alcance === 'estacion' && estaciones.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
              {alcance === 'via' && vias.map(v => (
                <option key={v.id} value={v.id}>{v.estacion?.nombre} — {v.numero}</option>
              ))}
              {alcance === 'equipo' && equipos.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.via?.estacion?.nombre} — {eq.nombre}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-3 mb-3">
          <Field label="Horas">
            <Input type="number" min={1} max={72} value={horas}
              onChange={e => setHoras(Number(e.target.value))} />
          </Field>
          <Field label="Motivo">
            <Input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Cambio de UPS" />
          </Field>
        </div>
        {error && <div className="text-xs text-danger mb-2">{error}</div>}
        <button onClick={crear} disabled={saving}
          className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all disabled:opacity-50">
          {saving ? 'Activando…' : '🔧 Activar mantenimiento'}
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'alcance', label: 'Aplica a', render: r => r.estacion ?? r.via ?? r.equipo ?? '—' },
            { key: 'motivo', label: 'Motivo' },
            { key: 'desde', label: 'Desde', render: r => fmt(r.desde) },
            { key: 'hasta', label: 'Hasta', render: r => fmt(r.hasta) },
            { key: 'creadoPor', label: 'Creado por' },
            { key: 'estado', label: 'Estado', render: r => activo(r)
                ? <span className="text-brand font-bold">🔧 Activo</span>
                : <span className="text-muted">Finalizado</span> },
            { key: 'acciones', label: '', render: r => activo(r)
                ? <button onClick={() => terminar(r)}
                    className="px-2.5 py-1 rounded-md bg-danger/15 text-danger text-xs font-bold hover:brightness-110">
                    Terminar ahora
                  </button>
                : null },
          ]}
          data={rows} keyField="id" loading={loading}
        />
      </div>
    </div>
  )
}
