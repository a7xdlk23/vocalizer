import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Play, Pause, Square, SkipBack, SkipForward,
  Volume2, VolumeX, Zap, X, AlertCircle, FolderOpen, Download, Loader2, Trash2, RefreshCw, Upload, LayoutList,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { Waveform } from './Waveform'
import { ImportModelModal } from './ImportModelModal'
import { BatchQueueView } from './BatchQueueView'
import { previewUrl } from '../api/client'
import { inTauri, pickOutputDirectory } from '../lib/tauri'
import type { StemMode } from '../types'

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return '--:--'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function displayTitle(file: { title?: string | null; filename: string }): string {
  if (file.title) return file.title
  return file.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function statusCls(status: string) {
  const m: Record<string, string> = {
    QUEUED: 'queued', LOADING_MODEL: 'loading', DOWNLOADING: 'downloading',
    PROCESSING: 'processing', SAVING: 'saving',
    COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled',
  }
  return m[status] ?? 'queued'
}

const ACTIVE_STATUSES = ['QUEUED', 'LOADING_MODEL', 'DOWNLOADING', 'PROCESSING', 'SAVING']

export function PlayerPanel() {
  const {
    files, selectedFileId,
    models, selectedModel, setSelectedModel,
    currentJobId, jobs,
    startSeparation, cancelJob,
    previewPath, activeStem, region, setRegion,
    overlap, setOverlap,
    segmentDuration, setSegmentDuration,
    stemMode, setStemMode,
    outputDir, setOutputDir,
    isPlaying, setIsPlaying, stopPlayback, skip,
    playerVolume, setPlayerVolume, playerMuted, togglePlayerMuted,
    currentTime, setCurrentTime, duration, setDuration,
    downloadModel, deleteModel, downloadProgress,
    error, clearError,
    setShowModelManager, addToast,
  } = useAppStore()

  const [showImportModal, setShowImportModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'track' | 'queue'>('track')

  const audioRef = useRef<HTMLAudioElement>(null)
  const selectedFile = useMemo(() => files.find((f) => f.id === selectedFileId), [files, selectedFileId])
  const job = currentJobId ? jobs[currentJobId] : null

  const isProcessing = Boolean(job && ACTIVE_STATUSES.includes(job.status))

  const activeJobCount = useMemo(
    () => Object.values(jobs).filter((j) => ACTIVE_STATUSES.includes(j.status)).length,
    [jobs],
  )

  // Auto-switch to queue tab when batch jobs start
  useEffect(() => {
    if (activeJobCount > 1) setActiveTab('queue')
  }, [activeJobCount])

  // Poll while processing
  useEffect(() => {
    if (!isProcessing) return
    const id = setInterval(() => useAppStore.getState().pollJob(), 1000)
    return () => clearInterval(id)
  }, [isProcessing, job?.id])

  const originalUrl = useMemo(
    () => (selectedFile?.storage_path ? previewUrl(selectedFile.storage_path) : ''),
    [selectedFile],
  )
  // Falls back to the original track so the transport (play/seek/time) works
  // before a stem has been chosen, not just after separation completes.
  const audioUrl = useMemo(
    () => (previewPath ? previewUrl(previewPath) : originalUrl),
    [previewPath, originalUrl],
  )

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audioUrl) {
      audio.src = audioUrl
      audio.load()
      if (isPlaying) audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.removeAttribute('src')
      audio.load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, activeStem])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.play().catch(() => setIsPlaying(false))
    else audio.pause()
  }, [isPlaying, setIsPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = playerMuted ? 0 : playerVolume
  }, [playerVolume, playerMuted])

  const filteredModels = useMemo(() => {
    if (stemMode === '6stem') return models.filter((m) => m.stem_count >= 6)
    if (stemMode === '2stem') return models.filter((m) => m.stem_count >= 2)
    return models.filter((m) => m.stem_count === 4)
  }, [models, stemMode])

  useEffect(() => {
    if (!filteredModels.some((m) => m.id === selectedModel) && filteredModels.length > 0)
      setSelectedModel(filteredModels[0].id)
  }, [filteredModels, selectedModel, setSelectedModel])

  const handleRegionUpdate = useCallback(
    (start: number, end: number) => setRegion({ start, end }),
    [setRegion],
  )

  const selectedModelInfo = models.find((m) => m.id === selectedModel)
  const dlProg = selectedModelInfo ? downloadProgress[selectedModelInfo.id] : null
  const isDownloading = dlProg?.status === 'downloading'

  const handlePickOutputDir = async () => {
    const dir = await pickOutputDirectory()
    if (dir) setOutputDir(dir)
  }

  const handleSeparate = () => {
    if (selectedModelInfo && !selectedModelInfo.installed) {
      addToast('Model not installed — opening Model Manager', 'info')
      setShowModelManager(true)
      return
    }
    startSeparation()
  }

  const progressFillCls =
    job?.status === 'COMPLETED' ? 'progress-fill done'
    : job?.status === 'FAILED' || job?.status === 'CANCELLED' ? 'progress-fill fail'
    : 'progress-fill'

  return (
    <div className="panel" style={{ height: '100%' }}>
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => setIsPlaying(false)}
        aria-hidden="true"
        style={{ display: 'none' }}
      />

      {/* Tab bar */}
      <div className="panel-header" style={{ gap: 4 }}>
        <button
          className={`tab-btn${activeTab === 'track' ? ' active' : ''}`}
          onClick={() => setActiveTab('track')}
        >
          Track
        </button>
        <button
          className={`tab-btn${activeTab === 'queue' ? ' active' : ''}`}
          onClick={() => setActiveTab('queue')}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <LayoutList size={12} />
          Queue
          {activeJobCount > 0 && (
            <span style={{
              background: 'var(--accent)', color: '#fff',
              borderRadius: 8, padding: '1px 5px', fontSize: 10, lineHeight: 1.4,
            }}>
              {activeJobCount}
            </span>
          )}
        </button>
        <div style={{ flex: 1 }} />
        {job && activeTab === 'track' && (
          <span className={`status-badge ${statusCls(job.status)}`}>
            {isProcessing && (
              <span className="spin" style={{ display: 'inline-flex', marginRight: 3 }}>
                <Loader2 size={10} />
              </span>
            )}
            {job.status.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Queue tab */}
      {activeTab === 'queue' && <BatchQueueView />}

      {/* Track tab */}
      {activeTab === 'track' && !selectedFile && (
        <div className="empty-state" style={{ flex: 1, justifyContent: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, textAlign: 'center' }}>
          <svg className="empty-state-icon" style={{ marginBottom: 16, color: 'var(--text-faint)' }} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Select a track</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Import audio files from the library</p>
        </div>
      )}

      {activeTab === 'track' && selectedFile && (
        <div className="player-body scroll">

          {/* Track info */}
          <div className="track-info">
            <div className="track-title truncate" title={selectedFile.filename}>
              {displayTitle(selectedFile)}
            </div>
            {selectedFile.artist && <div className="track-artist truncate">{selectedFile.artist}</div>}
            <div className="track-chips">
              {selectedFile.duration_seconds != null && (
                <span className="chip tabular">{fmt(selectedFile.duration_seconds)}</span>
              )}
              {selectedFile.sample_rate != null && (
                <span className="chip">{(selectedFile.sample_rate / 1000).toFixed(1)} kHz</span>
              )}
              {selectedFile.channels != null && (
                <span className="chip">
                  {selectedFile.channels === 2 ? 'Stereo' : selectedFile.channels === 1 ? 'Mono' : `${selectedFile.channels}ch`}
                </span>
              )}
              {selectedFile.format && <span className="chip">{selectedFile.format}</span>}
            </div>
          </div>

          {/* Waveform */}
          <div className="waveform-section">
            {originalUrl ? (
              <Waveform
                audioUrl={originalUrl}
                mediaRef={audioRef}
                onRegionUpdate={handleRegionUpdate}
                initialRegion={region ?? undefined}
              />
            ) : (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                Waveform unavailable
              </div>
            )}
            {region && (
              <div className="region-bar">
                <span className="tabular">{fmt(region.start)} – {fmt(region.end)}</span>
                <button className="icon-btn btn-sm" onClick={() => setRegion(null)} aria-label="Clear region">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="transport">
            <button className="icon-btn" onClick={() => skip(-10)} aria-label="Back 10s" title="−10s">
              <SkipBack size={15} />
            </button>
            <button
              className="icon-btn"
              style={{ padding: 7 }}
              onClick={() => audioUrl && setIsPlaying(!isPlaying)}
              disabled={!audioUrl}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button className="icon-btn" onClick={stopPlayback} aria-label="Stop">
              <Square size={14} />
            </button>
            <button className="icon-btn" onClick={() => skip(10)} aria-label="Forward 10s" title="+10s">
              <SkipForward size={15} />
            </button>

            <span className="transport-time tabular font-mono">
              {fmt(currentTime)}&thinsp;/&thinsp;{fmt(duration)}
            </span>

            <div className="seek-wrap">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (audioRef.current) audioRef.current.currentTime = v
                  setCurrentTime(v)
                }}
                disabled={!audioUrl}
                aria-label="Seek"
                style={{ '--range-fill': `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
              />
            </div>

            <button
              className="icon-btn"
              onClick={togglePlayerMuted}
              aria-label={playerMuted ? 'Unmute' : 'Mute'}
            >
              {playerMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0} max={1} step={0.02}
              value={playerVolume}
              onChange={(e) => setPlayerVolume(parseFloat(e.target.value))}
              aria-label="Volume"
              style={{ width: 60, '--range-fill': `${playerVolume * 100}%` } as React.CSSProperties}
            />
          </div>

          {/* Separation settings */}
          <div className="settings-section">
            <div className="section-label">Separation Settings</div>
            <div className="settings-grid">

              {/* Model */}
              <div className="setting-item" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="model-select">Model</label>
                <div className="flex gap-2 items-center">
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isProcessing}
                    style={{ flex: 1 }}
                  >
                    {filteredModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.installed ? '' : ' — not installed'}
                      </option>
                    ))}
                  </select>
                  {selectedModelInfo && !selectedModelInfo.installed && !isDownloading && (
                    <button
                      className="btn-sm"
                      style={{ flexShrink: 0 }}
                      onClick={() => downloadModel(selectedModelInfo.id)}
                      title={`Download ${selectedModelInfo.name} (${selectedModelInfo.size_mb} MB)`}
                    >
                      <Download size={12} />
                      {selectedModelInfo.size_mb ? `${selectedModelInfo.size_mb} MB` : 'Download'}
                    </button>
                  )}
                  {selectedModelInfo?.installed && !isDownloading && (
                    <button
                      className="icon-btn btn-sm"
                      style={{ flexShrink: 0, color: 'var(--danger)' }}
                      onClick={() => deleteModel(selectedModelInfo.id)}
                      title={`Remove ${selectedModelInfo.name} from cache`}
                      aria-label={`Delete cached model ${selectedModelInfo.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <button
                    className="icon-btn btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => setShowImportModal(true)}
                    title="Import a custom .pt / .onnx model"
                    aria-label="Import custom model"
                  >
                    <Upload size={12} />
                  </button>
                </div>
                {isDownloading && dlProg && (
                  <div style={{ marginTop: 6 }}>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${dlProg.progress}%` }} />
                    </div>
                    <div className="flex justify-between" style={{ marginTop: 4 }}>
                      <span className="text-xs text-faint">Downloading model…</span>
                      <span className="text-xs text-faint tabular">{dlProg.progress.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Stem mode */}
              <div className="setting-item">
                <label htmlFor="stem-mode">Stems</label>
                <select
                  id="stem-mode"
                  value={stemMode}
                  onChange={(e) => setStemMode(e.target.value as StemMode)}
                  disabled={isProcessing}
                >
                  <option value="2stem">2-stem (vocal/inst.)</option>
                  <option value="4stem">4-stem</option>
                  <option value="6stem">6-stem (+guitar/piano)</option>
                </select>
              </div>

              {/* Segment */}
              <div className="setting-item">
                <label htmlFor="segment-dur">Segment (s)</label>
                <input
                  id="segment-dur"
                  type="number"
                  min={1} max={120} step={1}
                  value={segmentDuration}
                  onChange={(e) => setSegmentDuration(parseFloat(e.target.value))}
                  disabled={isProcessing}
                />
              </div>

              {/* Overlap */}
              <div className="setting-item" style={{ gridColumn: '1 / -1' }}>
                <label>Overlap: {overlap.toFixed(2)}</label>
                <input
                  type="range"
                  min={0} max={0.9} step={0.05}
                  value={overlap}
                  onChange={(e) => setOverlap(parseFloat(e.target.value))}
                  disabled={isProcessing}
                  aria-label="Overlap"
                  style={{ '--range-fill': `${(overlap / 0.9) * 100}%` } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Output dir */}
            <div className="output-row" style={{ marginTop: 10 }}>
              <button
                className="icon-btn btn-sm"
                onClick={handlePickOutputDir}
                disabled={!inTauri()}
                title="Choose output directory"
              >
                <FolderOpen size={13} />
              </button>
              <span className="output-path text-xs text-faint">
                {outputDir || 'Default output folder'}
              </span>
            </div>
          </div>

          {/* Separate / Cancel */}
          <div className="separate-section">
            {isProcessing ? (
              <button className="btn-danger separate-btn" onClick={cancelJob} aria-label="Cancel">
                <X size={15} />
                Cancel Separation
              </button>
            ) : (
              <button
                className="btn-primary separate-btn"
                onClick={handleSeparate}
                disabled={!selectedFile || isProcessing}
                aria-label="Start separation"
              >
                <Zap size={15} />
                Separate
              </button>
            )}
          </div>

          {/* Progress */}
          {job && (
            <div className="progress-section">
              <div className="progress-bar">
                <div className={progressFillCls} style={{ width: `${job.progress}%` }} />
              </div>
              <div className="progress-meta">
                <span className={`status-badge ${statusCls(job.status)}`}>
                  {job.status.replace(/_/g, ' ')}
                </span>
                <span className="progress-pct">{job.progress.toFixed(0)}%</span>
              </div>
              {typeof job.eta_seconds === 'number' && job.eta_seconds > 0 && isProcessing && (
                <div className="eta-text">{fmt(job.eta_seconds)} remaining</div>
              )}
              {job.error_message && (
                <div className="error-banner">
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1 }}>{job.error_message}</span>
                  <button
                    className="btn-sm"
                    onClick={startSeparation}
                    title="Retry separation"
                    aria-label="Retry separation"
                  >
                    <RefreshCw size={11} />
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Global error */}
          {error && (
            <div className="error-banner" style={{ margin: '0 14px 12px' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{error}</span>
              <button className="icon-btn btn-sm" onClick={clearError}><X size={11} /></button>
            </div>
          )}

        </div>
      )}

      {showImportModal && (
        <ImportModelModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  )
}
