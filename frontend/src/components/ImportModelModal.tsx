import { useRef, useState } from 'react'
import { X, Upload, Plus } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../store/useAppStore'
import { inTauri } from '../lib/tauri'

interface Props {
  onClose: () => void
}

const COMMON_STEM_PRESETS = [
  { label: '4-stem', stems: ['vocals', 'drums', 'bass', 'other'] },
  { label: '6-stem', stems: ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] },
  { label: '2-stem', stems: ['vocals', 'no_vocals'] },
]

export function ImportModelModal({ onClose }: Props) {
  const { importModel, addToast } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [filePath, setFilePath] = useState('')
  const [stems, setStems] = useState<string[]>(['vocals', 'drums', 'bass', 'other'])
  const [newStem, setNewStem] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pickFile = async () => {
    if (inTauri()) {
      // Use Tauri dialog to get a local file path
      try {
        const path = await open({
          filters: [{ name: 'PyTorch Model', extensions: ['pt', 'th', 'pth', 'onnx'] }],
          multiple: false,
        })
        
        let selectedPath = ''
        if (typeof path === 'string') {
          selectedPath = path
        } else if (path && typeof path === 'object' && 'path' in path) {
          selectedPath = (path as any).path
        }
        
        if (selectedPath) {
          setFilePath(selectedPath)
          if (!name) setName(selectedPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? '')
        }
      } catch {
        fileInputRef.current?.click()
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    // In browser mode, we use the file name as a placeholder; actual path won't work
    // without Tauri but we allow the user to type it manually
    setFilePath(f.name)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const addStem = () => {
    const s = newStem.trim().toLowerCase().replace(/\s+/g, '_')
    if (s && !stems.includes(s)) {
      setStems([...stems, s])
      setNewStem('')
    }
  }

  const removeStem = (s: string) => setStems(stems.filter((x) => x !== s))

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Model name is required'); return }
    if (!filePath.trim()) { setError('Select a model file'); return }
    if (stems.length === 0) { setError('Add at least one stem'); return }
    setError('')
    setLoading(true)
    try {
      await importModel({ name: name.trim(), path: filePath.trim(), stems })
      addToast(`Imported model "${name.trim()}"`, 'success')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

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
        aria-label="Import custom model"
        style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '20px 22px', width: 380,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 24px 64px rgba(4,6,16,0.55)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
            Import Custom Model
          </span>
          <button className="icon-btn btn-sm" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* File picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            Model File (.pt / .th / .pth / .onnx)
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="/path/to/model.pt"
              style={{ flex: 1, fontSize: 12 }}
              aria-label="Model file path"
            />
            <button className="btn-sm" onClick={pickFile} style={{ flexShrink: 0 }}>
              <Upload size={12} />
              Browse
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pt,.th,.pth,.onnx"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Custom Model"
            aria-label="Model name"
          />
        </div>

        {/* Stems */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              Output Stems
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {COMMON_STEM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="btn-sm"
                  onClick={() => setStems(p.stems)}
                  style={{ fontSize: 10, padding: '2px 7px' }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 28 }}>
            {stems.map((s) => (
              <span
                key={s}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                }}
              >
                {s}
                <button
                  onClick={() => removeStem(s)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex' }}
                  aria-label={`Remove ${s}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newStem}
              onChange={(e) => setNewStem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStem()}
              placeholder="stem name…"
              style={{ flex: 1, fontSize: 12 }}
              aria-label="New stem name"
            />
            <button className="btn-sm" onClick={addStem} disabled={!newStem.trim()}>
              <Plus size={12} />
              Add
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 6, padding: '8px 10px',
            fontSize: 12, color: 'var(--danger)', lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Importing…' : 'Import Model'}
          </button>
        </div>
      </div>
    </div>
  )
}
