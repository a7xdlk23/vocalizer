import { useState } from 'react'
import {
  X, Download, Trash2, RefreshCw, Upload, CheckCircle2,
  HardDrive, Cpu, Gauge, Layers, AlertCircle, Loader2,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { ImportModelModal } from './ImportModelModal'

export function ModelManagerModal() {
  const {
    models,
    fetchModels,
    downloadModel,
    deleteModel,
    downloadProgress,
    selectedModel,
    setSelectedModel,
    setShowModelManager,
    addToast,
  } = useAppStore()

  const [showImport, setShowImport] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchModels()
    setRefreshing(false)
  }

  const handleDownload = (modelId: string) => {
    downloadModel(modelId)
    addToast('Download started', 'info')
  }

  const handleDelete = async (modelId: string) => {
    await deleteModel(modelId)
  }

  const handleSelect = (modelId: string) => {
    setSelectedModel(modelId)
    addToast(`Selected ${models.find((m) => m.id === modelId)?.name ?? modelId}`, 'info')
  }

  const onClose = () => setShowModelManager(false)

  return (
    <>
      <div
        className="model-manager-overlay"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Model Manager"
          className="model-manager-panel"
        >
          {/* Header */}
          <div className="model-manager-header">
            <div className="model-manager-title-row">
              <HardDrive size={16} style={{ color: 'var(--accent)' }} />
              <span className="model-manager-title">Model Manager</span>
              <span className="model-manager-count">{models.length} models</span>
            </div>
            <div className="model-manager-actions">
              <button
                className="icon-btn btn-sm"
                onClick={() => setShowImport(true)}
                title="Import custom model"
                aria-label="Import custom model"
              >
                <Upload size={13} />
              </button>
              <button
                className={`icon-btn btn-sm${refreshing ? ' spin' : ''}`}
                onClick={handleRefresh}
                title="Refresh model list"
                aria-label="Refresh models"
                disabled={refreshing}
              >
                <RefreshCw size={13} />
              </button>
              <button className="icon-btn btn-sm" onClick={onClose} aria-label="Close model manager">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Model list */}
          <div className="model-manager-body scroll">
            {models.length === 0 && (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <Layers className="empty-state-icon" size={36} />
                <p className="empty-state-title">No models found</p>
                <p className="empty-state-sub">
                  Check your backend connection or import a custom model.
                </p>
              </div>
            )}

            {models.map((model) => {
              const dlProg = downloadProgress[model.id]
              const isDownloading = dlProg?.status === 'downloading'
              const dlFailed = dlProg?.status === 'failed'
              const isSelected = model.id === selectedModel

              return (
                <div
                  key={model.id}
                  className={`model-card${isSelected ? ' selected' : ''}${model.installed ? ' installed' : ''}`}
                >
                  {/* Top row */}
                  <div className="model-card-top">
                    <div className={`model-status-dot${model.installed ? ' installed' : ''}`} />
                    <div className="model-card-info">
                      <div className="model-card-name">
                        {model.name}
                        {model.default && <span className="model-default-badge">Default</span>}
                      </div>
                      <div className="model-card-meta">
                        <span className="model-card-meta-item">
                          <Layers size={10} />
                          {model.stem_count}-stem
                        </span>
                        {model.size_mb != null && (
                          <span className="model-card-meta-item">
                            <HardDrive size={10} />
                            {model.size_mb} MB
                          </span>
                        )}
                        {model.quality_score != null && (
                          <span className="model-card-meta-item">
                            <Gauge size={10} />
                            {model.quality_score}
                          </span>
                        )}
                        {model.speed_score != null && (
                          <span className="model-card-meta-item">
                            <Cpu size={10} />
                            {model.speed_score}
                          </span>
                        )}
                      </div>
                      <div className="model-card-stems">
                        {model.stems.map((s) => (
                          <span key={s} className="model-stem-chip">{s}</span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="model-card-actions">
                      {!isSelected && model.installed && (
                        <button
                          className="btn-sm"
                          onClick={() => handleSelect(model.id)}
                          title="Use this model"
                          style={{ fontSize: 11 }}
                        >
                          Use
                        </button>
                      )}
                      {isSelected && model.installed && (
                        <span className="model-active-badge">
                          <CheckCircle2 size={10} />
                          Active
                        </span>
                      )}
                      {isSelected && !model.installed && (
                        <span className="model-active-badge" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          Selected
                        </span>
                      )}
                      {!model.installed && !isDownloading && (
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => handleDownload(model.id)}
                          title={`Download ${model.name}`}
                        >
                          <Download size={12} />
                          Install
                        </button>
                      )}
                      {isDownloading && (
                        <span className="model-downloading-badge">
                          <span className="spin" style={{ display: 'inline-flex' }}>
                            <Loader2 size={11} />
                          </span>
                          Installing…
                        </span>
                      )}
                      {model.installed && (
                        <button
                          className="icon-btn btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleDelete(model.id)}
                          title={`Remove ${model.name} from cache`}
                          aria-label={`Delete ${model.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Download progress */}
                  {isDownloading && dlProg && (
                    <div className="model-card-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${dlProg.progress}%` }} />
                      </div>
                      <div className="model-card-progress-meta">
                        <span className="text-xs text-faint">
                          {dlProg.bytes_downloaded > 0
                            ? `${(dlProg.bytes_downloaded / 1024 / 1024).toFixed(1)} / ${(dlProg.total_bytes / 1024 / 1024).toFixed(1)} MB`
                            : 'Starting…'}
                        </span>
                        <span className="text-xs text-faint tabular">
                          {dlProg.progress.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Download failed */}
                  {dlFailed && dlProg?.error_message && (
                    <div className="model-card-error">
                      <AlertCircle size={11} />
                      <span>{dlProg.error_message}</span>
                      <button
                        className="btn-sm"
                        onClick={() => handleDownload(model.id)}
                        style={{ marginLeft: 'auto', fontSize: 11 }}
                      >
                        <RefreshCw size={10} />
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="model-manager-footer">
            <button onClick={() => setShowImport(true)}>
              <Upload size={13} />
              Import Custom Model
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>

      {showImport && (
        <ImportModelModal onClose={() => setShowImport(false)} />
      )}
    </>
  )
}
