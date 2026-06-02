import { useRef, useCallback } from 'react'

export function useAlertSound() {
  const mutedRef = useRef(false)
  const ctxRef   = useRef<AudioContext | null>(null)

  const getCtx = () => {
    if (!ctxRef.current)
      ctxRef.current = new AudioContext()
    return ctxRef.current
  }

  // Nota individual con oscilador square — igual que note() del original
  const note = (ctx: AudioContext, freq: number, dur: number, vol: number, startAt: number) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type            = 'square'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol,  startAt)
    gain.gain.setValueAtTime(vol,  startAt + dur - 0.005)
    gain.gain.linearRampToValueAtTime(0, startAt + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startAt)
    osc.stop(startAt + dur + 0.01)
  }

  // 6 pulsos dobles descendentes — playDown() original
  const playDown = useCallback(() => {
    if (mutedRef.current) return
    try {
      const ac = getCtx()
      for (let i = 0; i < 6; i++) {
        const t = ac.currentTime + i * 0.55

        // Primer pitido: 880 Hz
        const o1 = ac.createOscillator(), g1 = ac.createGain()
        o1.type = 'square'; o1.frequency.value = 880
        g1.gain.setValueAtTime(0,    t)
        g1.gain.linearRampToValueAtTime(0.35, t + 0.01)
        g1.gain.linearRampToValueAtTime(0,    t + 0.13)
        o1.connect(g1); g1.connect(ac.destination)
        o1.start(t); o1.stop(t + 0.14)

        // Segundo pitido: 660 Hz
        const o2 = ac.createOscillator(), g2 = ac.createGain()
        o2.type = 'square'; o2.frequency.value = 660
        g2.gain.setValueAtTime(0,   t + 0.18)
        g2.gain.linearRampToValueAtTime(0.2, t + 0.19)
        g2.gain.linearRampToValueAtTime(0,   t + 0.28)
        o2.connect(g2); g2.connect(ac.destination)
        o2.start(t + 0.18); o2.stop(t + 0.29)
      }
    } catch { /* AudioContext bloqueado antes de interacción del usuario */ }
  }, [])

  // Escala ascendente — playUp() original
  // [[freq, dur], ...] con vol 0.3
  const playUp = useCallback(() => {
    if (mutedRef.current) return
    try {
      const ctx = getCtx()
      const t   = ctx.currentTime
      const scale: [number, number][] = [
        [262, 0.10], [330, 0.10], [392, 0.10],
        [523, 0.10], [659, 0.10], [784, 0.10],
        [1047, 0.22]
      ]
      scale.reduce((pos, [f, d]) => {
        note(ctx, f, d, 0.3, pos)
        return pos + d + 0.01
      }, t)
    } catch { }
  }, [])

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current
    return mutedRef.current
  }, [])

  return { playDown, playUp, toggleMute }
}
