// Detección automática de sede y categoría — espejo de BitacoraReglas.Detectar (backend, con pruebas xUnit).
// Compara PALABRAS COMPLETAS (también plural simple: anexo → anexos), sin tildes ni mayúsculas.
export interface PalabraClave { palabra: string; sedeId: number | null; categoriaId: number | null }
export interface Deteccion { sedeIds: number[]; categoriaId: number | null }

export function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
}

export function detectar(texto: string, palabras: PalabraClave[]): Deteccion {
  const tokens = normalizar(texto).match(/[a-z0-9]+/g) ?? []
  if (tokens.length === 0) return { sedeIds: [], categoriaId: null }

  const sedes: number[] = []
  const puntos = new Map<number, { n: number; primera: number }>()
  for (const p of palabras) {
    const w = normalizar(p.palabra)
    if (!w) continue
    const pos = tokens.findIndex(t => t === w || t === w + 's' || t === w + 'es')
    if (pos < 0) continue
    if (p.sedeId != null && !sedes.includes(p.sedeId)) sedes.push(p.sedeId)
    if (p.categoriaId != null) {
      const v = puntos.get(p.categoriaId)
      puntos.set(p.categoriaId, v ? { n: v.n + 1, primera: Math.min(v.primera, pos) } : { n: 1, primera: pos })
    }
  }
  let categoriaId: number | null = null
  let mejor: { n: number; primera: number } | null = null
  for (const [id, v] of puntos)
    if (!mejor || v.n > mejor.n || (v.n === mejor.n && v.primera < mejor.primera)) { categoriaId = id; mejor = v }
  return { sedeIds: sedes, categoriaId }
}
