import { X, Download, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { inTauri, pickOutputDirectory } from '../lib/tauri'
import type { ExportFormat, QualityPreset, StemMode } from '../types'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const {
    models,
    selectedModel, setSelectedModel,
    stemMode, setStemMode,
    overlap, setOverlap,
    segmentDuration, setSegmentDuration,
    device, setDevice,
    outputDir, setOutputDir,
    exportFormat, setExportFormat,
    qualityPreset, setQualityPreset,
    playerVolume, setPlayerVolume,
    downloadModel, deleteModel, downloadProgress,
  } = useAppStore()

  const handlePickDir = async () => {
    const dir = await pickOutputDirectory()
    if (dir) setOutputDir(dir)
  }

  const selectedModelInfo = models.find((m) => m.id === selectedModel)
  const dlProg = selectedModelInfo ? downloadProgress[selectedModelInfo.id] : null
  const isDownloading = dlProg?.status === 'downloading'

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )

  const stemModes: { value: StemMode; label: string }[] = [
    { value: '2stem', label: '2-stem' },
    { value: '4stem', label: '4-stem' },
    { value: '6stem', label: '6-stem' },
  ]
  const formats: ExportFormat[] = ['wav', 'mp3', 'flac', 'ogg', 'm4a']
  const qualities: QualityPreset[] = ['high', 'balanced', 'draft']
  const devices = ['auto', 'cuda', 'mps', 'cpu']

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="modal-content"
        style={{
          padding: '24px 28px', width: 540, gap: 0, overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Settings</span>
          <button className="icon-btn btn-sm" onClick={onClose} aria-label="Close settings">
            <X size={14} />
          </button>
        </div>

        <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>

          {/* Separation */}
          <div className="section-label" style={{ marginBottom: 10 }}>Separation Defaults</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <Row label="Default Model">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ width: 170, fontSize: 12 }}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.installed ? '' : ' (not installed)'}
                    </option>
                  ))}
                </select>
                {selectedModelInfo && !selectedModelInfo.installed && !isDownloading && (
                  <button
                    className="btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => downloadModel(selectedModelInfo.id)}
                    title={`Install ${selectedModelInfo.name}${selectedModelInfo.size_mb ? ` (${selectedModelInfo.size_mb} MB)` : ''}`}
                  >
                    <Download size={12} />
                    Install
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
              </div>
            </Row>
            {isDownloading && dlProg && (
              <Row label="">
                <div style={{ width: '100%' }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${dlProg.progress}%` }} />
                  </div>
                  <div className="flex justify-between" style={{ marginTop: 4 }}>
                    <span className="text-xs text-faint">Installing {selectedModelInfo?.name}…</span>
                    <span className="text-xs text-faint tabular">{dlProg.progress.toFixed(0)}%</span>
                  </div>
                </div>
              </Row>
            )}
            <Row label="Default Stems">
              <div className="format-tabs">
                {stemModes.map((m) => (
                  <button
                    key={m.value}
                    className={`format-tab${stemMode === m.value ? ' active' : ''}`}
                    onClick={() => setStemMode(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={`Overlap: ${overlap.toFixed(2)}`}>
              <input
                type="range" min={0} max={0.9} step={0.05}
                value={overlap}
                onChange={(e) => setOverlap(parseFloat(e.target.value))}
                style={{ width: 160, '--range-fill': `${(overlap / 0.9) * 100}%` } as React.CSSProperties}
                aria-label="Default overlap"
              />
            </Row>
            <Row label="Segment (s)">
              <input
                type="number" min={1} max={120} step={1}
                value={segmentDuration}
                onChange={(e) => setSegmentDuration(parseFloat(e.target.value))}
                style={{ width: 80, fontSize: 12 }}
                aria-label="Default segment duration"
              />
            </Row>
            <Row label="Device">
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                style={{ width: 120, fontSize: 12 }}
              >
                {devices.map((d) => (
                  <option key={d} value={d}>{d === 'auto' ? 'Auto-detect' : d.toUpperCase()}</option>
                ))}
              </select>
            </Row>
          </div>

          {/* Export */}
          <div className="section-label" style={{ marginBottom: 10 }}>Export Defaults</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <Row label="Format">
              <div className="format-tabs">
                {formats.map((f) => (
                  <button
                    key={f}
                    className={`format-tab${exportFormat === f ? ' active' : ''}`}
                    onClick={() => setExportFormat(f)}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Quality">
              <div className="format-tabs">
                {qualities.map((q) => (
                  <button
                    key={q}
                    className={`quality-btn${qualityPreset === q ? ' active' : ''}`}
                    onClick={() => setQualityPreset(q)}
                  >
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Output Directory">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', maxWidth: 220 }}>
                <span
                  className="truncate text-faint"
                  style={{ fontSize: 11, flex: 1, direction: 'rtl', textAlign: 'left' }}
                  title={outputDir ?? 'Default'}
                >
                  {outputDir || 'Default'}
                </span>
                <button className="btn-sm" onClick={handlePickDir} disabled={!inTauri()} style={{ flexShrink: 0 }}>
                  Browse
                </button>
                {outputDir && (
                  <button className="icon-btn btn-sm" onClick={() => setOutputDir(null)} title="Reset to default">
                    <X size={11} />
                  </button>
                )}
              </div>
            </Row>
          </div>

          {/* Playback */}
          <div className="section-label" style={{ marginBottom: 10 }}>Playback</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
            <Row label={`Default Volume: ${Math.round(playerVolume * 100)}%`}>
              <input
                type="range" min={0} max={1} step={0.02}
                value={playerVolume}
                onChange={(e) => setPlayerVolume(parseFloat(e.target.value))}
                style={{ width: 160, '--range-fill': `${playerVolume * 100}%` } as React.CSSProperties}
                aria-label="Default volume"
              />
            </Row>
          </div>

          {/* Keyboard shortcuts reference */}
          <div className="section-label" style={{ marginBottom: 8, marginTop: 8 }}>Keyboard Shortcuts</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 11 }}>
            {[
              ['Space', 'Play / Pause'],
              ['Ctrl+O', 'Open files'],
              ['Ctrl+E', 'Export all stems'],
            ].map(([key, desc]) => (
              <>
                <kbd
                  key={`k-${key}`}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace',
                    color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}
                >
                  {key}
                </kbd>
                <span key={`d-${desc}`} style={{ color: 'var(--text-faint)', alignSelf: 'center' }}>{desc}</span>
              </>
            ))}
          </div>

        </div>

        <div style={{ paddingTop: 16, textAlign: 'right' }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
