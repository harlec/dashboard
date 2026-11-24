import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MonitorTopbar } from '../components/MonitorTopbar'
import { useAuth } from '../hooks/useAuth'
import {
  bitacoraApi, type Catalogos, type Filtros, type Pagina, type Reciente, type Registro, type Resumen,
} from '../api/bitacora'
import { detectar } from '../lib/bitacoraDeteccion'
import { BitacoraCatalogos } from './BitacoraCatalogos'

const DURACIONES = [5, 15, 30, 60, 120]
const PAGE_SIZE = 15

// ── utilidades ─────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Fecha local sin zona (el backend guarda hora local, igual que el resto de Sigma)
const isoLocal = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const fechaCorta = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const duracionTxt = (m: number | null) => m == null ? '' : m >= 60 ? `${+(m / 60).toFixed(1)} h` : `${m} min`
// Color estable por categoría (mismo tono en claro y oscuro)
function colorCategoria(nombre: string) {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) % 360
  return `light-dark(oklch(0.58 0.13 ${h}), oklch(0.78 0.12 ${h}))`
}

type Cuando = 'hoy' | 'ayer' | 'otra'

export function Bitacora() {
  const { user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const [tab, setTab] = useState<'registro' | 'catalogos'>('registro')

  const [cat, setCat] = useState<Catalogos | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [recientes, setRecientes] = useState<Reciente[]>([])
  const [errCarga, setErrCarga] = useState('')

  const cargarResumen = useCallback(() => {
    bitacoraApi.resumen().then(setResumen).catch(() => {})
    bitacoraApi.recientes().then(setRecientes).catch(() => {})
  }, [])

  useEffect(() => {
    bitacoraApi.catalogos().then(setCat).catch(e => setErrCarga(e.message))
    cargarResumen()
  }, [cargarResumen])

  // Lista: se recarga al guardar/editar/eliminar
  const [version, setVersion] = useState(0)
  const refrescar = () => { setVersion(v => v + 1); cargarResumen() }

  return (
    <div className="min-h-screen page-bg">
      <MonitorTopbar />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--tx)' }}>Bitácora</h1>
            <p className="bit-note">registro de actividades del equipo de TI</p>
          </div>
          {esAdmin && (
            <div className="flex gap-2" role="tablist">
              <button className="bit-chip" role="tab" aria-pressed={tab === 'registro'} onClick={() => setTab('registro')}>Registro</button>
              <button className="bit-chip" role="tab" aria-pressed={tab === 'catalogos'} onClick={() => setTab('catalogos')}>Catálogos</button>
            </div>
          )}
        </header>

        {errCarga && <div className="bit-card bit-error">No se pudo cargar la Bitácora: {errCarga}</div>}

        {tab === 'catalogos' && esAdmin
          ? <BitacoraCatalogos onCambio={() => bitacoraApi.catalogos().then(setCat)} />
          : cat && (
            <>
              <TarjetasResumen r={resumen} />
              <Formulario cat={cat} recientes={recientes} onGuardado={refrescar} />
              <Lista cat={cat} version={version} onCambio={refrescar} />
            </>
          )}
      </main>
    </div>
  )
}

// ── Tres tarjetas de resumen ───────────────────────────────
function TarjetasResumen({ r }: { r: Resumen | null }) {
  const frase = !r ? ' ' : r.hoy === 0 ? 'Aún sin registros hoy' : r.hoy < 3 ? 'Buen comienzo' : 'Buen ritmo'
  const items = [
    { eyebrow: 'Hoy', valor: r?.hoy ?? '–', nota: frase, color: 'light-dark(oklch(0.45 0.11 195), oklch(0.84 0.10 195))' },
    { eyebrow: 'Esta semana', valor: r?.semana ?? '–', nota: 'actividades', color: 'light-dark(oklch(0.40 0.14 160), oklch(0.85 0.13 160))' },
    { eyebrow: 'Tiempo dedicado', valor: r ? r.horasSemana : '–', nota: 'horas de la semana', color: 'light-dark(oklch(0.45 0.13 300), oklch(0.80 0.11 300))' },
  ]
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Resumen">
      {items.map(i => (
        <div key={i.eyebrow} className="bit-card">
          <div className="bit-eyebrow" style={{ color: i.color }}>{i.eyebrow}</div>
          <div className="bit-big mt-2" style={{ color: i.color }}>{i.valor}</div>
          <div className="bit-note mt-1">{i.nota}</div>
        </div>
      ))}
    </section>
  )
}

// ── Registrar actividad ────────────────────────────────────
interface FormProps { cat: Catalogos; recientes: Reciente[]; onGuardado: () => void }

function Formulario({ cat, recientes, onGuardado }: FormProps) {
  const [params] = useSearchParams()
  const txtRef = useRef<HTMLTextAreaElement>(null)

  const [desc, setDesc] = useState('')
  const [sedeIds, setSedeIds] = useState<number[]>([])
  const [categoriaId, setCategoriaId] = useState<number | null>(null)
  const [tocoSede, setTocoSede] = useState(false)
  const [tocoCat, setTocoCat] = useState(false)
  const [duracion, setDuracion] = useState<number | null>(null)
  const [cuando, setCuando] = useState<Cuando>('hoy')
  const [otraFecha, setOtraFecha] = useState(ymd(new Date()))
  const [masDetalles, setMasDetalles] = useState(false)
  const [proveedorId, setProveedorId] = useState<number | null>(null)
  const [solicitante, setSolicitante] = useState('')
  const [responsableId, setResponsableId] = useState<number | null>(cat.miPersonalId)
  const [enProceso, setEnProceso] = useState(false)
  const [equipoRef, setEquipoRef] = useState('')
  const [errDesc, setErrDesc] = useState('')
  const [errSede, setErrSede] = useState('')
  const [errGeneral, setErrGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState('')

  // Abrir prellenada: /bitacora?sede=SAN&equipo=VIA803 (también &desc= y &categoria=)
  useEffect(() => {
    const sede = params.get('sede')?.toUpperCase()
    const s = cat.sedes.find(x => x.codigo.toUpperCase() === sede)
    if (s) { setSedeIds([s.id]); setTocoSede(true) }
    const eq = params.get('equipo'); if (eq) setEquipoRef(eq.slice(0, 100))
    const d = params.get('desc'); if (d) setDesc(d.slice(0, 500))
    const c = cat.categorias.find(x => x.nombre.toLowerCase() === params.get('categoria')?.toLowerCase())
    if (c) { setCategoriaId(c.id); setTocoCat(true) }
    txtRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (cat.miPersonalId && responsableId == null) setResponsableId(cat.miPersonalId) }, [cat.miPersonalId, responsableId])

  // Detección automática mientras se escribe (no pisa lo que la persona ya corrigió)
  const det = useMemo(() => detectar(desc, cat.palabrasClave.map(p => ({ palabra: p.palabra, sedeId: p.sedeId, categoriaId: p.categoriaId }))), [desc, cat.palabrasClave])
  useEffect(() => {
    if (!tocoSede && det.sedeIds.length) setSedeIds(det.sedeIds)
    if (!tocoCat && det.categoriaId != null) setCategoriaId(det.categoriaId)
  }, [det, tocoSede, tocoCat])

  const detectadoTxt = useMemo(() => {
    const sedes = det.sedeIds.map(id => cat.sedes.find(s => s.id === id)?.codigo).filter(Boolean)
    const c = cat.categorias.find(x => x.id === det.categoriaId)?.nombre
    const partes = [...(sedes.length ? [sedes.join(', ')] : []), ...(c ? [c] : [])]
    return partes.length ? `Detectado: ${partes.join(' · ')}` : ''
  }, [det, cat])

  const toggleSede = (id: number) => {
    setTocoSede(true); setErrSede('')
    setSedeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const aplicarReciente = (r: Reciente) => {
    setDesc(r.descripcion); setSedeIds(r.sedeIds.filter(id => cat.sedes.some(s => s.id === id)))
    setCategoriaId(cat.categorias.some(c => c.id === r.categoriaId) ? r.categoriaId : null)
    setDuracion(r.duracionMin); setTocoSede(true); setTocoCat(true); setErrDesc(''); setErrSede('')
    txtRef.current?.focus()
  }

  const fechaElegida = (): string | null => {
    if (cuando === 'hoy') return null                       // el servidor usa "ahora"
    if (cuando === 'ayer') return isoLocal(new Date(Date.now() - 86400000))
    return otraFecha === ymd(new Date()) ? null : isoLocal(new Date(`${otraFecha}T12:00:00`))
  }

  const guardar = async () => {
    setErrGeneral('')
    const sinDesc = desc.trim().length === 0
    const sinSede = sedeIds.length === 0
    setErrDesc(sinDesc ? 'Escribe qué se hizo' : '')
    setErrSede(sinSede ? 'Elige al menos una sede' : '')
    if (sinDesc) { txtRef.current?.focus(); return }
    if (sinSede) return

    setGuardando(true)
    try {
      const r = await bitacoraApi.crear({
        descripcion: desc.trim(), sedeIds, fecha: fechaElegida(), categoriaId, responsableId,
        proveedorId, solicitante: solicitante.trim() || null, duracionMin: duracion,
        estado: enProceso ? 2 : 1, equipoRef: equipoRef.trim() || null,
      })
      setToast(r.hoy >= 3 ? `Guardado. Van ${r.hoy} hoy` : 'Guardado')
      setTimeout(() => setToast(''), 2500)
      // Limpio y listo para el siguiente (la sede de la URL no se conserva)
      setDesc(''); setSedeIds([]); setCategoriaId(null); setTocoSede(false); setTocoCat(false)
      setDuracion(null); setSolicitante(''); setProveedorId(null); setEnProceso(false); setEquipoRef('')
      onGuardado()
      txtRef.current?.focus()
    } catch (e) {
      setErrGeneral((e as Error).message)
    } finally { setGuardando(false) }
  }

  const sinPersona = cat.miPersonalId == null

  return (
    <section className="bit-card" aria-labelledby="bit-reg-titulo">
      <h2 id="bit-reg-titulo" className="bit-title mb-3">Registrar actividad</h2>

      <label htmlFor="bit-desc" className="sr-only">Descripción de la actividad</label>
      <textarea id="bit-desc" ref={txtRef} rows={2} maxLength={500} autoFocus
        className="bit-field sigma-input" value={desc}
        placeholder="Disco lleno en vía 803 de Santa"
        onChange={e => { setDesc(e.target.value); if (e.target.value.trim()) setErrDesc('') }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar() } }}
        aria-invalid={!!errDesc} aria-describedby={errDesc ? 'bit-err-desc' : undefined} />
      {errDesc && <div id="bit-err-desc" role="alert" className="bit-error">{errDesc}</div>}
      {detectadoTxt && <div className="bit-detect" aria-live="polite">{detectadoTxt}</div>}

      {equipoRef && (
        <div className="mt-2 flex items-center gap-2">
          <span className="bit-tag">Equipo: {equipoRef}</span>
          <button type="button" className="bit-note underline" onClick={() => setEquipoRef('')}>quitar</button>
        </div>
      )}

      {recientes.length > 0 && (
        <div className="mt-4">
          <div className="bit-label">Repetir reciente</div>
          <div className="flex flex-wrap gap-2">
            {recientes.map(r => (
              <button key={r.descripcion} type="button" className="bit-chip" onClick={() => aplicarReciente(r)}
                title={r.descripcion} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ↻ {r.descripcion.length > 38 ? r.descripcion.slice(0, 38) + '…' : r.descripcion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="bit-label" id="bit-sedes-lbl">Sedes</div>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="bit-sedes-lbl">
          {cat.sedes.map(s => (
            <button key={s.id} type="button" className="bit-sede" aria-pressed={sedeIds.includes(s.id)}
              title={s.nombre} onClick={() => toggleSede(s.id)}>{s.codigo}</button>
          ))}
        </div>
        {errSede && <div role="alert" className="bit-error">{errSede}</div>}
      </div>

      <div className="mt-4">
        <div className="bit-label" id="bit-cat-lbl">Categoría</div>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="bit-cat-lbl">
          {cat.categorias.map(c => (
            <button key={c.id} type="button" className="bit-chip" aria-pressed={categoriaId === c.id}
              onClick={() => { setTocoCat(true); setCategoriaId(prev => prev === c.id ? null : c.id) }}>{c.nombre}</button>
          ))}
        </div>
        <div className="bit-note mt-1">Si no eliges, se guarda como “Otro”</div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="bit-label" id="bit-dur-lbl">Duración</div>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="bit-dur-lbl">
            {DURACIONES.map(m => (
              <button key={m} type="button" className="bit-chip" aria-pressed={duracion === m}
                onClick={() => setDuracion(prev => prev === m ? null : m)}>{m >= 60 ? `${m / 60} h` : `${m} min`}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="bit-label" id="bit-cuando-lbl">Cuándo</div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="bit-cuando-lbl">
            <button type="button" className="bit-chip" aria-pressed={cuando === 'hoy'} onClick={() => setCuando('hoy')}>Hoy</button>
            <button type="button" className="bit-chip" aria-pressed={cuando === 'ayer'} onClick={() => setCuando('ayer')}>Ayer</button>
            <button type="button" className="bit-chip" aria-pressed={cuando === 'otra'} onClick={() => setCuando('otra')}>Otra fecha</button>
            {cuando === 'otra' && (
              <input type="date" aria-label="Fecha de la actividad" className="bit-input" max={ymd(new Date())}
                value={otraFecha} onChange={e => setOtraFecha(e.target.value)} />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button type="button" className="bit-note underline" aria-expanded={masDetalles} onClick={() => setMasDetalles(v => !v)}>
          {masDetalles ? '▾' : '▸'} Más detalles
        </button>
        {(masDetalles || sinPersona) && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="bit-label" htmlFor="bit-prov">Proveedor</label>
              <select id="bit-prov" className="bit-select w-full" value={proveedorId ?? ''} onChange={e => setProveedorId(e.target.value ? +e.target.value : null)}>
                <option value="">Sin proveedor</option>
                {cat.proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="bit-label" htmlFor="bit-sol">Solicitante</label>
              <input id="bit-sol" className="bit-input w-full" maxLength={100} value={solicitante} onChange={e => setSolicitante(e.target.value)} />
            </div>
            <div>
              <label className="bit-label" htmlFor="bit-resp">Responsable{sinPersona ? ' (obligatorio)' : ''}</label>
              <select id="bit-resp" className="bit-select w-full" value={responsableId ?? ''} onChange={e => setResponsableId(e.target.value ? +e.target.value : null)}>
                {sinPersona && <option value="">Elige…</option>}
                {cat.personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 bit-note sm:self-end pb-2 cursor-pointer">
              <input type="checkbox" className="accent-brand w-4 h-4" checked={enProceso} onChange={e => setEnProceso(e.target.checked)} />
              Sigue en proceso
            </label>
          </div>
        )}
      </div>

      {errGeneral && <div role="alert" className="bit-error mt-3">{errGeneral}</div>}

      <div className="mt-5">
        <button type="button" onClick={guardar} disabled={guardando}
          className="sigma-btn w-full sm:w-auto sm:min-w-[220px] rounded-xl py-3 px-8 font-bold tracking-[0.18em] disabled:opacity-60">
          {guardando ? 'GUARDANDO…' : 'GUARDAR'}
        </button>
      </div>

      {toast && <div className="bit-toast" role="status">{toast}</div>}
    </section>
  )
}

// ── Últimas actividades ────────────────────────────────────
function Lista({ cat, version, onCambio }: { cat: Catalogos; version: number; onCambio: () => void }) {
  const [filtros, setFiltros] = useState<Filtros>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Pagina | null>(null)
  const [err, setErr] = useState('')
  const [editando, setEditando] = useState<Registro | null>(null)
  const [borrando, setBorrando] = useState<number | null>(null)
  const [resolviendo, setResolviendo] = useState<number | null>(null)
  const [fechaSol, setFechaSol] = useState(ymd(new Date()))

  // La búsqueda por texto espera a que se deje de escribir
  useEffect(() => {
    const t = setTimeout(() => { setFiltros(f => ({ ...f, q })); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    bitacoraApi.lista({ ...filtros, page, pageSize: PAGE_SIZE }).then(d => { setData(d); setErr('') }).catch(e => setErr(e.message))
  }, [filtros, page, version])

  const setF = (patch: Partial<Filtros>) => { setFiltros(f => ({ ...f, ...patch })); setPage(1) }
  const totalPag = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const resolver = async (r: Registro) => {
    try {
      // Hoy → el servidor usa el momento actual; otro día → mediodía de esa fecha
      await bitacoraApi.resolver(r.id, fechaSol === ymd(new Date()) ? null : isoLocal(new Date(`${fechaSol}T12:00:00`)))
      setResolviendo(null); onCambio()
    } catch (e) { setErr((e as Error).message) }
  }

  const eliminar = async (id: number) => {
    try { await bitacoraApi.eliminar(id); setBorrando(null); onCambio() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <section className="bit-card" aria-labelledby="bit-lista-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="bit-lista-titulo" className="bit-title">Últimas actividades</h2>
        <a className="bit-btn-sec" href={bitacoraApi.exportarUrl(filtros)} download>Exportar a Excel</a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
        <div><label className="bit-label" htmlFor="f-desde">Desde</label>
          <input id="f-desde" type="date" className="bit-input w-full" value={filtros.desde ?? ''} onChange={e => setF({ desde: e.target.value })} /></div>
        <div><label className="bit-label" htmlFor="f-hasta">Hasta</label>
          <input id="f-hasta" type="date" className="bit-input w-full" value={filtros.hasta ?? ''} onChange={e => setF({ hasta: e.target.value })} /></div>
        <div><label className="bit-label" htmlFor="f-sede">Sede</label>
          <select id="f-sede" className="bit-select w-full" value={filtros.sedeId ?? ''} onChange={e => setF({ sedeId: e.target.value ? +e.target.value : '' })}>
            <option value="">Todas</option>{cat.sedes.map(s => <option key={s.id} value={s.id}>{s.codigo}</option>)}</select></div>
        <div><label className="bit-label" htmlFor="f-cat">Categoría</label>
          <select id="f-cat" className="bit-select w-full" value={filtros.categoriaId ?? ''} onChange={e => setF({ categoriaId: e.target.value ? +e.target.value : '' })}>
            <option value="">Todas</option>{cat.categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <div><label className="bit-label" htmlFor="f-resp">Responsable</label>
          <select id="f-resp" className="bit-select w-full" value={filtros.responsableId ?? ''} onChange={e => setF({ responsableId: e.target.value ? +e.target.value : '' })}>
            <option value="">Todos</option>{cat.personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
        <div><label className="bit-label" htmlFor="f-q">Buscar</label>
          <input id="f-q" type="search" className="bit-input w-full" placeholder="Texto…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>

      {err && <div role="alert" className="bit-error mb-2">{err}</div>}
      {data && data.items.length === 0 && <div className="bit-note py-6 text-center">Sin actividades con esos filtros</div>}

      <div>
        {data?.items.map(r => (
          <div key={r.id} className="bit-row">
            <span className="bit-dot" style={{ background: colorCategoria(r.categoria) }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div style={{ color: 'var(--tx)', fontSize: '.98rem', overflowWrap: 'anywhere' }}>{r.descripcion}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 bit-note">
                <span>{fechaCorta(r.fecha)}</span>
                <span>{r.categoria}</span>
                <span>{r.responsable}</span>
                {r.proveedor && <span>{r.proveedor}</span>}
                {r.estado === 2 && <span className="bit-tag">En proceso</span>}
                {r.estado === 1 && r.fechaSolucion && r.fechaSolucion.slice(0, 10) !== r.fecha.slice(0, 10) && (
                  <span className="bit-tag" title="Se resolvió otro día">Resuelto el {fechaCorta(r.fechaSolucion).slice(0, 5)}</span>
                )}
                {r.equipoRef && <span className="bit-tag">{r.equipoRef}</span>}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1 max-w-[9rem]">
              {r.sedes.map(s => <span key={s.id} className="bit-tag">{s.codigo}</span>)}
            </div>
            <div className="w-14 text-right bit-note shrink-0">{duracionTxt(r.duracionMin)}</div>
            {r.estado === 2 && (
              <div className="flex items-center gap-1 shrink-0">
                {resolviendo === r.id ? (
                  <>
                    <input type="date" aria-label="Fecha de solución" className="bit-input" min={r.fecha.slice(0, 10)} max={ymd(new Date())}
                      value={fechaSol} onChange={e => setFechaSol(e.target.value)} />
                    <button className="bit-btn-sec" onClick={() => resolver(r)}>Confirmar</button>
                    <button className="bit-btn-sec" onClick={() => setResolviendo(null)}>Cancelar</button>
                  </>
                ) : (
                  <button className="bit-btn-sec" onClick={() => { setFechaSol(ymd(new Date())); setResolviendo(r.id) }}>Resolver</button>
                )}
              </div>
            )}
            {r.puedeEditar && (
              <div className="flex gap-1 shrink-0">
                {borrando === r.id ? (
                  <>
                    <button className="bit-btn-sec bit-btn-danger" onClick={() => eliminar(r.id)}>Eliminar</button>
                    <button className="bit-btn-sec" onClick={() => setBorrando(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="bit-btn-sec" aria-label={`Editar: ${r.descripcion}`} onClick={() => setEditando(r)}>Editar</button>
                    <button className="bit-btn-sec" aria-label={`Eliminar: ${r.descripcion}`} onClick={() => setBorrando(r.id)}>✕</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3">
          <button className="bit-btn-sec" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="bit-note">Página {page} de {totalPag} · {data.total} actividades</span>
          <button className="bit-btn-sec" disabled={page >= totalPag} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}

      {editando && <EditarModal r={editando} cat={cat} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); onCambio() }} />}
    </section>
  )
}

// ── Editar una actividad ───────────────────────────────────
function EditarModal({ r, cat, onClose, onGuardado }: { r: Registro; cat: Catalogos; onClose: () => void; onGuardado: () => void }) {
  const [desc, setDesc] = useState(r.descripcion)
  const [sedeIds, setSedeIds] = useState(r.sedes.map(s => s.id))
  const [categoriaId, setCategoriaId] = useState(r.categoriaId)
  const [responsableId, setResponsableId] = useState(r.responsableId)
  const [proveedorId, setProveedorId] = useState<number | null>(r.proveedorId)
  const [solicitante, setSolicitante] = useState(r.solicitante ?? '')
  const [duracion, setDuracion] = useState<number | null>(r.duracionMin)
  const [fecha, setFecha] = useState(r.fecha.slice(0, 10))
  const [enProceso, setEnProceso] = useState(r.estado === 2)
  const [fechaSolucion, setFechaSolucion] = useState((r.fechaSolucion ?? (r.estado === 2 ? ymd(new Date()) : r.fecha)).slice(0, 10))
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const guardar = async () => {
    if (!desc.trim()) { setErr('Escribe qué se hizo'); return }
    if (sedeIds.length === 0) { setErr('Elige al menos una sede'); return }
    setGuardando(true)
    try {
      // Si no cambió el día se conserva la hora original
      const fechaIso = fecha === r.fecha.slice(0, 10) ? r.fecha.slice(0, 19) : isoLocal(new Date(`${fecha}T12:00:00`))
      await bitacoraApi.editar(r.id, {
        descripcion: desc.trim(), sedeIds, fecha: fechaIso, categoriaId, responsableId, proveedorId,
        solicitante: solicitante.trim() || null, duracionMin: duracion, estado: enProceso ? 2 : 1, equipoRef: r.equipoRef,
        // Solo si sigue "Hecho": si no cambió el día se conserva el original; si se está cerrando ahora, hoy
        fechaSolucion: enProceso ? null
          : r.fechaSolucion && fechaSolucion === r.fechaSolucion.slice(0, 10) ? r.fechaSolucion.slice(0, 19)
          : r.estado === 2 && fechaSolucion === ymd(new Date()) ? null
          : isoLocal(new Date(`${fechaSolucion}T12:00:00`)),
      })
      onGuardado()
    } catch (e) { setErr((e as Error).message) } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Editar actividad" onClick={onClose}>
      <div className="bit-card w-full max-w-xl" style={{ background: 'var(--panel-b)' }} onClick={e => e.stopPropagation()}>
        <h2 className="bit-title mb-3">Editar actividad</h2>
        <label className="bit-label" htmlFor="ed-desc">Descripción</label>
        <textarea id="ed-desc" rows={3} maxLength={500} className="bit-field sigma-input" value={desc} onChange={e => setDesc(e.target.value)} />

        <div className="bit-label mt-3">Sedes</div>
        <div className="flex flex-wrap gap-2">
          {cat.sedes.map(s => (
            <button key={s.id} type="button" className="bit-sede" aria-pressed={sedeIds.includes(s.id)}
              onClick={() => setSedeIds(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id])}>{s.codigo}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div><label className="bit-label" htmlFor="ed-cat">Categoría</label>
            <select id="ed-cat" className="bit-select w-full" value={categoriaId} onChange={e => setCategoriaId(+e.target.value)}>
              {cat.categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div><label className="bit-label" htmlFor="ed-resp">Responsable</label>
            <select id="ed-resp" className="bit-select w-full" value={responsableId} onChange={e => setResponsableId(+e.target.value)}>
              {cat.personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div><label className="bit-label" htmlFor="ed-prov">Proveedor</label>
            <select id="ed-prov" className="bit-select w-full" value={proveedorId ?? ''} onChange={e => setProveedorId(e.target.value ? +e.target.value : null)}>
              <option value="">Sin proveedor</option>{cat.proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div><label className="bit-label" htmlFor="ed-sol">Solicitante</label>
            <input id="ed-sol" className="bit-input w-full" maxLength={100} value={solicitante} onChange={e => setSolicitante(e.target.value)} /></div>
          <div><label className="bit-label" htmlFor="ed-fecha">Fecha</label>
            <input id="ed-fecha" type="date" className="bit-input w-full" max={ymd(new Date())} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
          <div><div className="bit-label">Duración</div>
            <div className="flex flex-wrap gap-2">
              {DURACIONES.map(m => (
                <button key={m} type="button" className="bit-chip" aria-pressed={duracion === m}
                  onClick={() => setDuracion(p => p === m ? null : m)}>{m >= 60 ? `${m / 60} h` : `${m} min`}</button>
              ))}
            </div></div>
        </div>
        <label className="flex items-center gap-2 bit-note mt-3 cursor-pointer">
          <input type="checkbox" className="accent-brand w-4 h-4" checked={enProceso} onChange={e => setEnProceso(e.target.checked)} /> Sigue en proceso
        </label>
        {!enProceso && (
          <div className="mt-3 max-w-[14rem]">
            <label className="bit-label" htmlFor="ed-sol-fecha">Fecha de solución</label>
            <input id="ed-sol-fecha" type="date" className="bit-input w-full" min={fecha} max={ymd(new Date())}
              value={fechaSolucion} onChange={e => setFechaSolucion(e.target.value)} />
          </div>
        )}

        {err && <div role="alert" className="bit-error mt-3">{err}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="bit-btn-sec" onClick={onClose}>Cancelar</button>
          <button className="sigma-btn rounded-xl py-2 px-6 font-bold tracking-[0.15em] disabled:opacity-60" disabled={guardando} onClick={guardar}>GUARDAR</button>
        </div>
      </div>
    </div>
  )
}
