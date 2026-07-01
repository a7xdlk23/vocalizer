import { useEffect, useRef, type RefObject } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'

interface WaveformProps {
  audioUrl: string
  mediaRef?: RefObject<HTMLAudioElement | null>
  onReady?: () => void
  onRegionUpdate?: (start: number, end: number) => void
  initialRegion?: { start: number; end: number } | null
}

export function Waveform({
  audioUrl,
  mediaRef,
  onReady,
  onRegionUpdate,
  initialRegion,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionRef = useRef<Region | null>(null)

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return

    // Bind to the app's shared <audio> element (passed via mediaRef) so playback,
    // seeking, and current time stay driven by one element instead of two
    // independent audio engines (this element and WaveSurfer's own).
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#c3c9d6',
      progressColor: 'var(--accent)',
      cursorColor: 'var(--accent)',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 180,
      normalize: true,
      url: audioUrl,
      media: mediaRef?.current ?? undefined,
    })

    const regions = ws.registerPlugin(RegionsPlugin.create())
    const regionColor = 'rgba(138, 180, 248, 0.25)'

    const bindRegion = (region: Region) => {
      regionRef.current = region
      region.on('update-end', () => onRegionUpdate?.(region.start, region.end))
      region.on('update', () => onRegionUpdate?.(region.start, region.end))
    }

    // Only restore a region if the caller already has one saved — do not
    // default to a full-track region, which paints an overlay across the
    // entire waveform and hides the peaks underneath on every fresh load.
    ws.on('ready', () => {
      if (initialRegion) {
        bindRegion(regions.addRegion({ ...initialRegion, color: regionColor, drag: true, resize: true }))
      }
      onReady?.()
    })

    regions.enableDragSelection({ color: regionColor })
    regions.on('region-created', (region) => {
      if (regionRef.current && regionRef.current.id !== region.id) regionRef.current.remove()
      bindRegion(region)
    })

    wavesurferRef.current = ws

    return () => {
      regionRef.current = null
      ws.destroy()
      wavesurferRef.current = null
    }
  }, [audioUrl, onReady, onRegionUpdate, initialRegion])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', minHeight: 180 }}
      role="img"
      aria-label="Audio waveform with selectable time region"
    />
  )
}
