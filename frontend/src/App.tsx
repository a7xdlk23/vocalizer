import { useEffect, useState } from 'react'
import { Settings, Package } from 'lucide-react'
import { Layout } from './components/Layout'
import { LibraryPanel } from './components/LibraryPanel'
import { PlayerPanel } from './components/PlayerPanel'
import { StemsPanel } from './components/StemsPanel'
import { SettingsModal } from './components/SettingsModal'
import { ModelManagerModal } from './components/ModelManagerModal'
import { ToastContainer } from './components/Toast'
import { useAppStore } from './store/useAppStore'
import { openAudioFiles, inTauri } from './lib/tauri'

function App() {
  const { bootstrap, backendReady, togglePlayPause, uploadNativeFiles, uploadFile, showModelManager, setShowModelManager } = useAppStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault()
        if (inTauri()) {
          const picked = await openAudioFiles()
          if (picked.length) uploadNativeFiles(picked.map((f) => ({ blob: f.blob, name: f.name })))
        } else {
          const el = document.createElement('input')
          el.type = 'file'
          el.multiple = true
          el.accept = 'audio/*'
          el.onchange = () => {
            if (el.files) Array.from(el.files).forEach((f) => uploadFile(f))
          }
          el.click()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlayPause, uploadNativeFiles, uploadFile])

  return (
    <>
      <Layout
        left={<LibraryPanel />}
        center={<PlayerPanel />}
        right={<StemsPanel />}
        titlebarRight={
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="icon-btn btn-sm"
              onClick={() => setShowModelManager(true)}
              title="Model Manager"
              aria-label="Open model manager"
              style={{ color: 'var(--text-faint)' }}
            >
              <Package size={14} />
            </button>
            <button
              className="icon-btn btn-sm"
              onClick={() => setShowSettings(true)}
              title="Settings (preferences)"
              aria-label="Open settings"
              style={{ color: 'var(--text-faint)' }}
            >
              <Settings size={14} />
            </button>
          </div>
        }
      />
      <ToastContainer />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showModelManager && <ModelManagerModal />}
      {!backendReady && (
        <div className="engine-boot-overlay">
          <div className="engine-boot-card">
            <div className="engine-boot-spinner" />
            <div className="engine-boot-title">Starting audio engine…</div>
            <div className="engine-boot-sub">Loading the separation models. This can take a moment on first launch.</div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
