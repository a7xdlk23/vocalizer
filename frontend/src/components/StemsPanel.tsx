import { useCallback, useEffect, useState } from 'react'
import {
  Play, Pause, VolumeX, Volume2, Download, FolderOpen, Layers,
  CheckCircle2, Merge, Archive,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { inTauri, pickOutputDirectory } from '../lib/tauri'
import { previewUrl } from '../api/client'
import { StemWaveformThumb } from './StemWaveformThumb'
import type { ExportFormat, QualityPreset } from '../types'

function stemColor(name: string): string {
  const map: Record<string, string> = {
    vocals: 'var(--stem-vocals)',
    drums:  'var(--stem-drums)',
    bass:   'var(--stem-bass)',
    other:  'var(--stem-other)',
    guitar: 'var(--stem-guitar)',
    piano:  'var(--stem-piano)',
  }
  const key = name.startsWith('no_') ? name.slice(3) : name
  return map[key] ?? 'var(--accent)'
}

export function StemsPanel() {
  const {
    currentJobId, jobs,
    activeStem, setActiveStem, setPreviewPath,
    stemStates, setStemVolume, toggleStemMute, toggleStemSolo, toggleStemSelected,
    exportFormat, setExportFormat,
    qualityPreset, setQualityPreset,
    outputDir, setOutputDir,
    exportStems,
    isPlaying, setIsPlaying,
    addToast,
  } = useAppStore()

  const [exporting, setExporting] = useState(false)
  const [merge, setMerge] = useState(false)
  const [zip, setZip] = useState(false)

  const job = currentJobId ? jobs[currentJobId] : null
  const stems = job?.stem_paths ? Object.keys(job.stem_paths) : []
  const isCompleted = job?.status === 'COMPLETED'

  const handlePlay = (stem: string) => {
    if (!job?.stem_paths) return
    if (activeStem === stem && isPlaying) {
      setIsPlaying(false)
    } else {
      setActiveStem(stem)
      setPreviewPath(job.stem_paths[stem])
      setIsPlaying(true)
    }
  }

  const handleExport = useCallback(async (selectedOnly: boolean) => {
    if (!isCompleted || exporting) return
    const targets = selectedOnly ? stems.filter((s) => stemStates[s]?.selected) : undefined
    setExporting(true)
    try {
      const paths = await exportStems(targets, { merge, zip })
      const count = Object.keys(paths).length
      const label = zip ? 'archive' : merge ? 'merged file' : `stem${count !== 1 ? 's' : ''}`
      addToast(`Exported ${zip || merge ? '' : `${count} `}${label}`, 'success')
    } catch (err) {
      addToast(`Export failed: ${(err as Error).message}`, 'error')
    } finally {
      setExporting(false)
    }
  }, [isCompleted, exporting, stems, stemStates, exportStems, merge, zip, addToast])

  // Ctrl+E = export all
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyE') {
        e.preventDefault()
        handleExport(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleExport])

  const handlePickDir = async () => {
    const dir = await pickOutputDirectory()
    if (dir) setOutputDir(dir)
  }

  const formats: ExportFormat[] = ['wav', 'mp3', 'flac', 'ogg', 'm4a']
  const qualities: QualityPreset[] = ['high', 'balanced', 'draft']
  const selectedCount = stems.filter((s) => stemStates[s]?.selected).length

  const exportControls = (
    <div className={`export-section${!isCompleted ? ' export-disabled' : ''}`}>
      <div className="section-label">
        Export
        {!isCompleted && <span className="text-faint" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>— available after separation</span>}
      </div>

      <div className="format-tabs">
        {formats.map((f) => (
          <button
            key={f}
            className={`format-tab${exportFormat === f ? ' active' : ''}`}
            onClick={() => setExportFormat(f)}
            aria-pressed={exportFormat === f}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="quality-tabs">
        {qualities.map((q) => (
          <button
            key={q}
            className={`quality-btn${qualityPreset === q ? ' active' : ''}`}
            onClick={() => setQualityPreset(q)}
            aria-pressed={qualityPreset === q}
          >
            {q.charAt(0).toUpperCase() + q.slice(1)}
          </button>
        ))}
      </div>

      <div className="merge-row">
        <button
          className={`format-tab${merge ? ' active' : ''}`}
          onClick={() => { setMerge((v) => !v); setZip(false) }}
          title="Mix selected stems into one file"
          aria-pressed={merge}
          style={{ gap: 5 }}
        >
          <Merge size={11} />
          Merge
        </button>
        <button
          className={`format-tab${zip ? ' active' : ''}`}
          onClick={() => { setZip((v) => !v); setMerge(false) }}
          title="Bundle stems into a ZIP archive"
          aria-pressed={zip}
          style={{ gap: 5 }}
        >
          <Archive size={11} />
          ZIP
        </button>
      </div>

      <div className="export-dir-row">
        <button className="btn-sm" onClick={handlePickDir} disabled={!inTauri()} title="Choose export directory">
          <FolderOpen size={11} /> Dir
        </button>
        <span className="export-dir-path">{outputDir || 'Default exports folder'}</span>
      </div>

      <div className="export-row">
        <button
          className="btn-primary"
          onClick={() => handleExport(false)}
          disabled={!isCompleted || exporting}
          aria-label="Export all stems (Ctrl+E)"
          title="Export all (Ctrl+E)"
        >
          <Download size={13} />
          {exporting ? 'Exporting…' : 'All'}
        </button>
        <button
          onClick={() => handleExport(true)}
          disabled={!isCompleted || selectedCount === 0 || exporting}
          title={selectedCount === 0 ? 'Check stems to select' : `Export ${selectedCount} selected`}
        >
          <Download size={13} />
          {`Selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </button>
      </div>
    </div>
  )

  if (!isCompleted && stems.length === 0) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        <div className="panel-header"><span className="panel-title">Stems</span></div>
        <div className="empty-state" style={{ flex: 1, justifyContent: 'center' }}>
          <Layers className="empty-state-icon" size={40} />
          <p className="empty-state-title">No stems yet</p>
          <p className="empty-state-sub">Select a track and press<br />Separate to extract stems</p>
        </div>
        {exportControls}
      </div>
    )
  }

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <span className="panel-title">Stems</span>
        {isCompleted && (
          <span className="status-badge completed">
            <CheckCircle2 size={10} style={{ marginRight: 3 }} />
            {stems.length} stems
          </span>
        )}
      </div>

      <div className="stems-list scroll">
        {stems.map((stem) => {
          const state = stemStates[stem] ?? { volume: 1, muted: false, solo: false, selected: false }
          const isActivePlaying = activeStem === stem && isPlaying

          return (
            <div
              key={stem}
              className={`stem-card${activeStem === stem ? ' active' : ''}`}
              style={{ '--stem-color': stemColor(stem) } as React.CSSProperties}
            >
              <div className="stem-top">
                <input
                  type="checkbox"
                  checked={!!state.selected}
                  onChange={() => toggleStemSelected(stem)}
                  aria-label={`Select ${stem} for export`}
                  style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span className="stem-name">{stem.replace(/_/g, ' ')}</span>
                <div className="flex gap-1 items-center">
                  <button
                    className={`stem-btn${isActivePlaying ? ' playing' : ''}`}
                    onClick={() => handlePlay(stem)}
                    aria-label={isActivePlaying ? `Pause ${stem}` : `Play ${stem}`}
                  >
                    {isActivePlaying ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button
                    className={`stem-btn${state.muted ? ' muted' : ''}`}
                    onClick={() => toggleStemMute(stem)}
                    aria-label={state.muted ? `Unmute ${stem}` : `Mute ${stem}`}
                  >
                    {state.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <button
                    className={`stem-btn${state.solo ? ' soloing' : ''}`}
                    onClick={() => toggleStemSolo(stem)}
                    aria-label={`Solo ${stem}`}
                    style={{ fontSize: 10, fontWeight: 700, padding: '3px 6px', borderRadius: 3 }}
                  >
                    S
                  </button>
                </div>
              </div>
              <StemWaveformThumb
                audioUrl={previewUrl(job!.stem_paths![stem])}
                color={`var(--stem-${stem.startsWith('no_') ? stem.slice(3) : stem}, var(--accent))`}
              />
              <div className="stem-vol-row">
                <Volume2 size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                <input
                  type="range"
                  min={0} max={1} step={0.02}
                  value={state.volume}
                  onChange={(e) => setStemVolume(stem, parseFloat(e.target.value))}
                  aria-label={`${stem} volume`}
                  style={{ '--range-fill': `${state.volume * 100}%` } as React.CSSProperties}
                />
                <span className="stem-vol-val">{Math.round(state.volume * 100)}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {exportControls}
    </div>
  )
}
