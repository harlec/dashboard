import { useRef, useCallback, useEffect, type MutableRefObject } from 'react'

// Los mp3 personalizados se reproducen con AudioBufferSourceNode (Web Audio API) en vez
// de <audio>/HTMLMediaElement: Chrome exige que <audio>.play() acumule "Media Engagement
// Index" (reproducciones previas con sonido) para poder sonar sin gesto del usuario — un
// origen nuevo empieza en cero y queda mudo en una pantalla NOC sin clics. El AudioContext,
// en cambio, sólo necesita UN gesto en cualquier momento de la pestaña para desbloquearse
// permanentemente, igual que el tono sintetizado — por eso el tono por defecto sí sonaba solo.

// Tono sintetizado "clásico" — se usa como fallback cuando el admin no subió un mp3 propio
const DOWN_TONE = { wave: 'square' as OscillatorType, pulses: 6, interval: 0.55, freq1: 880, dur1: 0.14, vol1: 0.35, freq2: 660, dur2: 0.11, vol2: 0.2, gap2: 0.18 }
const UP_TONE   = { wave: 'square' as OscillatorType, vol: 0.3, scale: [[262, 0.10], [330, 0.10], [392, 0.10], [523, 0.10], [659, 0.10], [784, 0.10], [1047, 0.22]] as [number, number][] }

// Tope de duración para mp3 personalizados: aunque el admin suba un audio largo (~30s),
// no debe sonar más que esto — y una alerta nueva del mismo tipo corta a la anterior en vez
// de sumarse encima (varios equipos cayendo casi juntos no deben amontonar audios largos).
const MAX_CUSTOM_MS = 5000

export function useAlertSound() {
  const mutedRef  = useRef(false)
  const ctxRef    = useRef<AudioContext | null>(null)
  const tonoDownRef = useRef<string | null>(null) // nombre de archivo mp3 custom, o null
  const tonoUpRef   = useRef<string | null>(null)
  const sourceDownRef = useRef<AudioBufferSourceNode | null>(null)
  const sourceUpRef   = useRef<AudioBufferSourceNode | null>(null)
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map())

  useEffect(() => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { clave: string; valor: string }[]) => {
        const down = data.find(c => c.clave === 'tono_desconexion_archivo')?.valor
        const up   = data.find(c => c.clave === 'tono_reconexion_archivo')?.valor
        tonoDownRef.current = down ? down : null
        tonoUpRef.current   = up ? up : null
      })
      .catch(() => { /* sin config disponible, se usa el tono sintetizado por defecto */ })
  }, [])

  // Los navegadores bloquean audio (Web Audio API y <audio>) hasta el primer gesto
  // del usuario en la página. En una pantalla NOC sin interacción, ese gesto nunca
  // llega y las alertas quedan mudas sin ningún error visible — se arma el
  // AudioContext apenas ocurra el primer click/tecla en cualquier parte de la página.
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getCtx()
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      } catch { /* AudioContext no disponible */ }
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const getCtx = () => {
    if (!ctxRef.current)
      ctxRef.current = new AudioContext()
    return ctxRef.current
  }

  const tone = (ctx: AudioContext, wave: OscillatorType, freq: number, dur: number, vol: number, startAt: number) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type            = wave
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(vol, startAt + 0.01)
    gain.gain.setValueAtTime(vol, startAt + dur - 0.02)
    gain.gain.linearRampToValueAtTime(0, startAt + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startAt)
    osc.stop(startAt + dur + 0.01)
  }

  const runSynthDown = useCallback(() => {
    try {
      const ctx = getCtx()
      for (let i = 0; i < DOWN_TONE.pulses; i++) {
        const t = ctx.currentTime + i * DOWN_TONE.interval
        tone(ctx, DOWN_TONE.wave, DOWN_TONE.freq1, DOWN_TONE.dur1, DOWN_TONE.vol1, t)
        tone(ctx, DOWN_TONE.wave, DOWN_TONE.freq2, DOWN_TONE.dur2, DOWN_TONE.vol2, t + DOWN_TONE.gap2)
      }
    } catch { /* AudioContext bloqueado antes de interacción del usuario */ }
  }, [])

  const runSynthUp = useCallback(() => {
    try {
      const ctx = getCtx()
      let pos = ctx.currentTime
      UP_TONE.scale.forEach(([f, d]) => {
        tone(ctx, UP_TONE.wave, f, d, UP_TONE.vol, pos)
        pos += d + 0.01
      })
    } catch { /* AudioContext bloqueado antes de interacción del usuario */ }
  }, [])

  const loadBuffer = async (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
    const cached = bufferCacheRef.current.get(url)
    if (cached) return cached
    const res = await fetch(url)
    const bytes = await res.arrayBuffer()
    const buffer = await ctx.decodeAudioData(bytes)
    bufferCacheRef.current.set(url, buffer)
    return buffer
  }

  // Corta cualquier reproducción previa del mismo tipo y arranca la nueva, con tope de duración.
  // Vía AudioContext (no <audio>) para heredar el mismo desbloqueo del tono sintetizado.
  const playCustom = (ref: MutableRefObject<AudioBufferSourceNode | null>, url: string) => {
    try {
      const ctx = getCtx()
      if (ref.current) {
        try { ref.current.stop() } catch { /* ya terminó */ }
        ref.current = null
      }
      loadBuffer(ctx, url).then(buffer => {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.onended = () => { if (ref.current === source) ref.current = null }
        ref.current = source
        source.start(ctx.currentTime, 0, Math.min(buffer.duration, MAX_CUSTOM_MS / 1000))
      }).catch(() => {})
    } catch { /* AudioContext bloqueado antes de interacción del usuario */ }
  }

  const playDown = useCallback(() => {
    if (mutedRef.current) return
    if (tonoDownRef.current) {
      playCustom(sourceDownRef, `/api/audio/${tonoDownRef.current}`)
    } else {
      runSynthDown()
    }
  }, [runSynthDown])

  const playUp = useCallback(() => {
    if (mutedRef.current) return
    if (tonoUpRef.current) {
      playCustom(sourceUpRef, `/api/audio/${tonoUpRef.current}`)
    } else {
      runSynthUp()
    }
  }, [runSynthUp])

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current
    return mutedRef.current
  }, [])

  return { playDown, playUp, toggleMute }
}
