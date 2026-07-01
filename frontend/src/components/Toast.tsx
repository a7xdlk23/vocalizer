import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore()

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} msg={t.msg} type={t.type} onDismiss={removeToast} />
      ))}
    </div>
  )
}

function ToastItem({
  id,
  msg,
  type,
  onDismiss,
}: {
  id: string
  msg: string
  type: 'success' | 'error' | 'info'
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(id), type === 'error' ? 5000 : 3500)
    return () => clearTimeout(t)
  }, [id, type, onDismiss])

  return (
    <div className={`toast ${type}`} role="status" aria-live="polite">
      {type === 'success' && (
        <svg className="toast-icon-s" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {type === 'error' && (
        <svg className="toast-icon-e" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
      {type === 'info' && (
        <svg className="toast-icon-i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
      <span className="toast-msg">{msg}</span>
      <button className="icon-btn btn-sm" onClick={() => onDismiss(id)} aria-label="Dismiss">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
