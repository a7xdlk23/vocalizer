import { useEffect, useRef, useState } from 'react'

interface Props {
  audioUrl: string
  color?: string
}

export function StemWaveformThumb({ audioUrl, color = '#6b9cf4' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (!audioUrl) return
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect()
          load()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  // Only re-run when the URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  async function load() {
    setState('loading')
    const controller = new AbortController()
    try {
      const res = await fetch(audioUrl, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()

      const audioCtx = new AudioContext()
      const decoded = await audioCtx.decodeAudioData(buf)
      audioCtx.close()

      draw(decoded.getChannelData(0))
      setState('done')
    } catch {
      setState('error')
    }
  }

  function draw(data: Float32Array) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const step = Math.max(1, Math.floor(data.length / W))
    const mid = H / 2

    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.75
    ctx.beginPath()

    for (let x = 0; x < W; x++) {
      let lo = 0, hi = 0
      const base = x * step
      for (let j = 0; j < step; j++) {
        const s = data[base + j] ?? 0
        if (s < lo) lo = s
        if (s > hi) hi = s
      }
      const yLo = mid + lo * mid * 0.88
      const yHi = mid + hi * mid * 0.88
      ctx.moveTo(x + 0.5, yLo)
      ctx.lineTo(x + 0.5, yHi)
    }
    ctx.stroke()
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 28,
        position: 'relative',
        borderRadius: 3,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
      aria-hidden="true"
    >
      {state === 'loading' && (
        <div
          className="shimmer"
          style={{ position: 'absolute', inset: 0, borderRadius: 3 }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={300}
        height={28}
        style={{
          width: '100%',
          height: 28,
          display: 'block',
          opacity: state === 'done' ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      />
    </div>
  )
}
