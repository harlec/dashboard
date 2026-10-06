import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Input, Select } from '../components/admin/FormModal'

interface Transito {
  fecha: string; estacion: string; via: number; viaNombre: string; sentido: string; ticket: string
  placaCajero: string; placaOcr: string; categoria: string; tipoOperacion: string; tipoTransito: string
}
interface Camara { id: number; canal: number; tipo: string; viaNumero?: number | null; sentido?: string | null; nombre: string }
interface CamarasResp { retencionDias: number; camaras: Camara[] }
interface ClipEstado { estado: string; mensaje?: string; url?: string; archivo?: string; tipo?: string; nombre?: string; diasConservacion?: number; sha256?: string }

const COEST: Record<string, number> = { FORTALEZA: 1, HUARMEY: 2, '402': 3, VIRU: 4, SANTA: 5 }
const PEAJES = [['', 'Todos los peajes'], ['FORTALEZA', 'Fortaleza'], ['HUARMEY', 'Huarmey'], ['402', 'KM 402'], ['VIRU', 'Virú'], ['SANTA', 'Santa']]
const TIPOS = ['OCR', 'VALIDACION', 'PTZ'] as const

const pad = (n: number) => String(n).padStart(2, '0')
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const inicioDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

export function Oficios() {
  const { user } = useAuth()

  const [placa, setPlaca] = useState('')
  const [desde, setDesde] = useState(local(inicioDia(new Date())))
  const [hasta, setHasta] = useState(local(new Date()))
  const [estacion, setEstacion] = useState('')
  const [antes, setAntes] = useState(90)
  const [despues, setDespues] = useState(90)
  const [borrar, setBorrar] = useState(false)
  const [tipos, setTipos] = useState<Record<string, boolean>>({ OCR: true, VALIDACION: true, PTZ: true })

  const [rows, setRows] = useState<Transito[] | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')

  const [abierto, setAbierto] = useState<number | null>(null)
  const [camaras, setCamaras] = useState<Record<string, CamarasResp | string>>({})
  const [clips, setClips] = useState<Record<string, ClipEstado | 'cargando'>>({})
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null)
  const cancelar = useRef(false)

  if (user && user.rol !== 'admin') {
    return <div className="p-8 text-danger font-bold">Este módulo es solo para administradores.</div>
  }

  const duracionMin = ((antes + despues) / 60).toFixed(1).replace('.0', '')

  const preset = (p: 'hoy' | 'ayer' | '24h') => {
    const ahora = new Date()
    if (p === 'hoy') { setDesde(local(inicioDia(ahora))); setHasta(local(ahora)) }
    if (p === 'ayer') { const h = inicioDia(ahora); const d = new Date(h.getTime() - 86400000); setDesde(local(d)); setHasta(local(h)) }
    if (p === '24h') { setDesde(local(new Date(ahora.getTime() - 86400000))); setHasta(local(ahora)) }
  }

  const buscar = async () => {
    setBuscando(true); setError(''); setRows(null); setAbierto(null); setClips({})
    const qs = new URLSearchParams({ placa, desde: desde + ':00', hasta: hasta + ':00' })
    if (estacion) qs.set('estacion', estacion)
    const res = await fetch(`/api/oficios/transitos?${qs}`, { credentials: 'include' })
    setBuscando(false)
    if (!res.ok) { setError((await res.text()) || `Error ${res.status}`); return }
    const data: Transito[] = await res.json()
    setRows(data)
    setSel(new Set(data.map((_, i) => i)))
  }

  const obtenerCamaras = async (t: Transito): Promise<CamarasResp | string> => {
    const key = `${t.estacion}-${t.via}-${t.sentido}`
    if (camaras[key]) return camaras[key]
    const qs = new URLSearchParams({ coest: String(COEST[t.estacion]), via: String(t.via), sentido: t.sentido })
    const res = await fetch(`/api/nvr/camaras?${qs}`, { credentials: 'include' })
    const data: CamarasResp | string = res.ok ? await res.json() : ((await res.text()) || 'Sin NVR configurado para este peaje')
    setCamaras(p => ({ ...p, [key]: data }))
    return data
  }

  const exportarUno = async (i: number, t: Transito, c: Camara) => {
    const key = `${i}-${c.canal}`
    setClips(p => ({ ...p, [key]: 'cargando' }))
    let j: ClipEstado
    try {
      const res = await fetch('/api/oficios/clip', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coest: COEST[t.estacion], canal: c.canal, fechaPaso: t.fecha.replace(' ', 'T'),
                               antesSegundos: antes, despuesSegundos: despues }),
      })
      const txt = await res.text()
      try { j = JSON.parse(txt) } catch { j = { estado: 'Error', mensaje: txt || `HTTP ${res.status}` } }
      if (res.status === 403) j = { estado: 'Error', mensaje: 'Solo un administrador puede exportar' }
    } catch { j = { estado: 'Error', mensaje: 'No se pudo contactar al servidor' } }
    setClips(p => ({ ...p, [key]: j }))
    return j
  }

  const verCamaras = async (i: number, t: Transito) => {
    if (abierto === i) { setAbierto(null); return }
    setAbierto(i)
    await obtenerCamaras(t)
  }

  const exportarLote = async () => {
    if (!rows) return
    const idx = [...sel].sort((a, b) => a - b)
    cancelar.current = false
    setProgreso({ hecho: 0, total: idx.length })
    for (let n = 0; n < idx.length; n++) {
      if (cancelar.current) break
      const i = idx[n], t = rows[i]
      const cams = await obtenerCamaras(t)
      if (typeof cams !== 'string') {
        for (const c of cams.camaras.filter(c => tipos[c.tipo])) {
          if (cancelar.current) break
          const r = await exportarUno(i, t, c)
          if (r.estado === 'FueraDeRetencion') break   // el resto de cámaras del evento tampoco tendrá video
        }
      }
      setProgreso({ hecho: n + 1, total: idx.length })
    }
    setProgreso(null)
  }

  const okClips = Object.entries(clips)
    .filter((e): e is [string, ClipEstado] => e[1] !== 'cargando' && e[1].estado === 'Completado' && !!e[1].archivo)
  const zipUrl = `/api/oficios/zip?archivos=${encodeURIComponent(okClips.map(([, c]) => c.archivo).join(','))}&borrar=${borrar}`
  const dias = okClips[0]?.[1].diasConservacion

  const btn = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-border hover:bg-surface-3 disabled:opacity-50'
  const lbl = 'block text-[0.75rem] text-muted font-bold uppercase mb-1'

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-extrabold text-[#eae7e4] mb-4">Oficios — tránsitos y video por placa</h1>

      <div className="bg-surface rounded-xl border border-border p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={lbl}>Placa</label>
            <Input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="B1A-852" /></div>
          <div><label className={lbl}>Desde</label>
            <Input type="datetime-local" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><label className={lbl}>Hasta</label>
            <Input type="datetime-local" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div><label className={lbl}>Peaje</label>
            <Select value={estacion} onChange={e => setEstacion(e.target.value)}>
              {PEAJES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </Select></div>
          <button onClick={buscar} disabled={!placa.trim() || buscando}
            className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 disabled:opacity-50">
            {buscando ? 'Buscando…' : 'Buscar tránsitos'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted">
          Atajos:
          <button className={btn} onClick={() => preset('hoy')}>Hoy</button>
          <button className={btn} onClick={() => preset('ayer')}>Ayer</button>
          <button className={btn} onClick={() => preset('24h')}>Últimas 24 h</button>
        </div>

        <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-border">
          <div className="w-32"><label className={lbl}>Seg. antes del paso</label>
            <Input type="number" min={0} max={1800} value={antes} onChange={e => setAntes(Number(e.target.value))} /></div>
          <div className="w-32"><label className={lbl}>Seg. después</label>
            <Input type="number" min={0} max={1800} value={despues} onChange={e => setDespues(Number(e.target.value))} /></div>
          <div className="text-sm text-[#eae7e4] pb-2">Duración por evento: <b>{duracionMin} min</b></div>
          <label className="flex items-center gap-2 text-sm text-[#eae7e4] pb-2 cursor-pointer">
            <input type="checkbox" checked={borrar} onChange={e => setBorrar(e.target.checked)} />
            Borrar el MP4 del servidor al descargarlo
          </label>
        </div>
      </div>

      {error && <div className="text-danger text-sm mb-3">{error}</div>}
      {rows && rows.length === 0 && <div className="text-muted">Sin tránsitos registrados para esa placa en el periodo.</div>}

      {rows && rows.length > 0 && (
        <>
          <div className="bg-surface rounded-xl border border-border p-4 mb-4 flex flex-wrap items-center gap-4">
            <div className="text-sm text-[#eae7e4]"><b>{rows.length}</b> tránsito(s) · <b>{sel.size}</b> seleccionado(s)</div>
            <div className="flex items-center gap-3 text-sm text-[#eae7e4]">
              Cámaras:
              {TIPOS.map(t => (
                <label key={t} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={tipos[t]} onChange={e => setTipos(p => ({ ...p, [t]: e.target.checked }))} /> {t}
                </label>
              ))}
            </div>
            {progreso ? (
              <>
                <span className="text-sm text-[#eae7e4]">Exportando {progreso.hecho}/{progreso.total}…</span>
                <button className={btn} onClick={() => { cancelar.current = true }}>Cancelar</button>
              </>
            ) : (
              <button onClick={exportarLote} disabled={sel.size === 0 || !TIPOS.some(t => tipos[t])}
                className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 disabled:opacity-50">
                Exportar video de {sel.size} evento(s)
              </button>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.7rem] text-muted uppercase">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={sel.size === rows.length}
                      onChange={e => setSel(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())} />
                  </th>
                  <th>Fecha y hora</th><th>Peaje</th><th>Vía</th><th>Sentido</th>
                  <th>Ticket</th><th>Placa cajero</th><th>Placa OCR</th><th>Categoría</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const key = `${t.estacion}-${t.via}-${t.sentido}`
                  const cams = camaras[key]
                  return (
                    <Fila key={i} t={t} i={i} btn={btn}
                      checked={sel.has(i)}
                      onCheck={c => setSel(p => { const n = new Set(p); c ? n.add(i) : n.delete(i); return n })}
                      abierto={abierto === i} camaras={cams} clips={clips} borrar={borrar}
                      onVer={() => verCamaras(i, t)} onExportar={c => exportarUno(i, t, c)} />
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {okClips.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="font-extrabold text-[#eae7e4]">Videos exportados ({okClips.length})</div>
            <a href={zipUrl} className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110">
              Descargar todo en ZIP
            </a>
          </div>
          {dias && <div className="text-xs text-muted mb-2">
            Se conservan {dias} días en el servidor y luego se borran solos{borrar ? '; al descargar también se borran' : ''}.
            El ZIP incluye <code>manifest.txt</code> para verificar los hashes con <code>sha256sum -c</code>.
          </div>}
          <ul className="text-sm text-[#eae7e4] space-y-1">
            {okClips.map(([k, c]) => {
              const t = rows?.[Number(k.split('-')[0])]
              return (
                <li key={k} className="flex flex-wrap items-center gap-3">
                  <span className="w-44 text-muted">{t?.fecha}</span>
                  <span className="w-40">{t?.estacion} · vía {t?.via}</span>
                  <span className="w-56">{c.tipo} — {c.nombre}</span>
                  <a className="text-brand font-bold underline" href={`${c.url}?borrar=${borrar}`}>Descargar MP4</a>
                  <HashChip hash={c.sha256} />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function Fila({ t, i, btn, checked, onCheck, abierto, camaras, clips, borrar, onVer, onExportar }: {
  t: Transito; i: number; btn: string; checked: boolean; onCheck: (c: boolean) => void
  abierto: boolean; camaras?: CamarasResp | string; clips: Record<string, ClipEstado | 'cargando'>; borrar: boolean
  onVer: () => void; onExportar: (c: Camara) => void
}) {
  // Estado del lote para este evento (aunque la fila no esté expandida)
  const estados = Object.entries(clips).filter(([k]) => k.startsWith(`${i}-`)).map(([, v]) => v)
  const resumen = estados.length === 0 ? '' :
    estados.some(e => e === 'cargando') ? '⏳' :
    estados.every(e => e !== 'cargando' && e.estado === 'Completado') ? '✅' :
    estados.some(e => e !== 'cargando' && e.estado === 'FueraDeRetencion') ? '⌛ sin video' : '⚠️'

  return (
    <>
      <tr className="border-t border-border text-[#eae7e4]">
        <td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)} /></td>
        <td className="font-bold">{t.fecha}</td>
        <td>{t.estacion}</td><td>{t.viaNombre} <span className="text-muted">({t.via})</span></td><td>{t.sentido || '—'}</td>
        <td>{t.ticket || '—'}</td><td>{t.placaCajero || '—'}</td><td>{t.placaOcr || '—'}</td><td>{t.categoria}</td>
        <td className="text-right pr-3 whitespace-nowrap">{resumen} <button className={btn} onClick={onVer}>{abierto ? 'Ocultar' : 'Cámaras'}</button></td>
      </tr>
      {abierto && (
        <tr className="bg-surface-3">
          <td colSpan={10} className="px-4 py-3">
            {camaras === undefined && <span className="text-muted">Buscando cámaras…</span>}
            {typeof camaras === 'string' && <span className="text-danger">{camaras}</span>}
            {camaras && typeof camaras !== 'string' && (
              <div className="space-y-2">
                <div className="text-xs text-muted">Retención del NVR: {camaras.retencionDias} días</div>
                {camaras.camaras.length === 0 && <div className="text-muted">Sin cámaras configuradas para esta vía/sentido.</div>}
                {camaras.camaras.map(c => {
                  const st = clips[`${i}-${c.canal}`]
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm text-[#eae7e4]">
                      <span className="w-40">Canal {c.canal} · {c.tipo}</span>
                      <span className="w-56 text-muted">{c.nombre}</span>
                      <button className={btn} disabled={st === 'cargando'} onClick={() => onExportar(c)}>
                        {st === 'cargando' ? 'Descargando…' : 'Exportar MP4'}
                      </button>
                      {st && st !== 'cargando' && st.estado === 'Completado' && st.url && (
                        <>
                          <a className="text-brand font-bold underline" href={`${st.url}?borrar=${borrar}`}>Descargar</a>
                          <HashChip hash={st.sha256} />
                        </>
                      )}
                      {st && st !== 'cargando' && st.estado !== 'Completado' &&
                        <span className="text-danger text-xs">{st.estado}: {st.mensaje}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// Muestra el hash SHA-256 del clip (integridad de la evidencia) con botón de copiar,
// para incluirlo en el oficio de respuesta a la fiscalía.
function HashChip({ hash }: { hash?: string }) {
  const [copiado, setCopiado] = useState(false)
  if (!hash) return null

  const copiar = async () => {
    try { await navigator.clipboard.writeText(hash) } catch { /* portapapeles no disponible (http/permiso) */ }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted" title={`SHA-256: ${hash}`}>
      sha256 {hash.slice(0, 12)}…
      <button onClick={copiar} className="underline hover:text-brand" type="button">{copiado ? 'copiado ✓' : 'copiar'}</button>
    </span>
  )
}
