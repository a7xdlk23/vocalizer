import { CheckCircle2, XCircle, Loader2, Clock, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

const STATUS_ORDER = ['PROCESSING', 'LOADING_MODEL', 'DOWNLOADING', 'SAVING', 'QUEUED', 'COMPLETED', 'FAILED', 'CANCELLED']

function statusIcon(status: string) {
  if (['PROCESSING', 'LOADING_MODEL', 'DOWNLOADING', 'SAVING'].includes(status))
    return <Loader2 size={12} className="spin" />
  if (status === 'COMPLETED') return <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
  if (status === 'FAILED') return <XCircle size={12} style={{ color: 'var(--danger)' }} />
  if (status === 'CANCELLED') return <X size={12} style={{ color: 'var(--text-faint)' }} />
  return <Clock size={12} style={{ color: 'var(--text-faint)' }} />
}

function statusCls(status: string) {
  const m: Record<string, string> = {
    QUEUED: 'queued', LOADING_MODEL: 'loading', DOWNLOADING: 'downloading',
    PROCESSING: 'processing', SAVING: 'saving',
    COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled',
  }
  return m[status] ?? 'queued'
}

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return '--:--'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function BatchQueueView() {
  const { files, jobs, cancelJob, currentJobId } = useAppStore()

  const jobList = Object.values(jobs)
    .sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status)
      const bi = STATUS_ORDER.indexOf(b.status)
      return ai - bi
    })

  if (jobList.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1, justifyContent: 'center', padding: '32px 0' }}>
        <Clock className="empty-state-icon" size={36} />
        <p className="empty-state-title">No jobs yet</p>
        <p className="empty-state-sub">Select files and press Separate<br />to queue separation jobs</p>
      </div>
    )
  }

  const active = jobList.filter((j) => ['QUEUED', 'LOADING_MODEL', 'DOWNLOADING', 'PROCESSING', 'SAVING'].includes(j.status))
  const done = jobList.filter((j) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(j.status))

  return (
    <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {active.length > 0 && (
        <>
          <div className="section-label" style={{ padding: '8px 14px 4px' }}>
            Active — {active.length}
          </div>
          {active.map((job) => (
            <JobRow key={job.id} job={job} files={files} isActive={job.id === currentJobId} onCancel={cancelJob} />
          ))}
        </>
      )}
      {done.length > 0 && (
        <>
          <div className="section-label" style={{ padding: '8px 14px 4px', marginTop: active.length ? 6 : 0 }}>
            History — {done.length}
          </div>
          {done.map((job) => (
            <JobRow key={job.id} job={job} files={files} isActive={false} onCancel={cancelJob} />
          ))}
        </>
      )}
    </div>
  )
}

function JobRow({
  job,
  files,
  isActive,
  onCancel,
}: {
  job: ReturnType<typeof useAppStore.getState>['jobs'][string]
  files: ReturnType<typeof useAppStore.getState>['files']
  isActive: boolean
  onCancel: () => void
}) {
  const file = files.find((f) => f.id === job.file_id)
  const name = file?.title ?? file?.filename?.replace(/\.[^.]+$/, '') ?? job.file_id.slice(0, 8)
  const isRunning = ['QUEUED', 'LOADING_MODEL', 'DOWNLOADING', 'PROCESSING', 'SAVING'].includes(job.status)

  return (
    <div
      style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        background: isActive ? 'var(--accent-dim)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {statusIcon(job.status)}
        <span
          className="truncate"
          style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text)' }}
          title={name}
        >
          {name}
        </span>
        <span className={`status-badge ${statusCls(job.status)}`} style={{ flexShrink: 0 }}>
          {job.status.replace(/_/g, ' ')}
        </span>
        {isRunning && isActive && (
          <button
            className="icon-btn btn-sm"
            onClick={onCancel}
            title="Cancel"
            aria-label="Cancel job"
            style={{ flexShrink: 0 }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {isRunning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div className="progress-bar" style={{ height: 3 }}>
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {job.model} · {fmt(job.elapsed_seconds)} elapsed
            </span>
            {typeof job.eta_seconds === 'number' && job.eta_seconds > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                ~{fmt(job.eta_seconds)} left
              </span>
            )}
          </div>
        </div>
      )}

      {job.status === 'COMPLETED' && (
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          {job.model} · {Object.keys(job.stem_paths ?? {}).length} stems · {fmt(job.elapsed_seconds)}
        </span>
      )}

      {job.error_message && (
        <span style={{ fontSize: 10, color: 'var(--danger)', wordBreak: 'break-word' }}>
          {job.error_message}
        </span>
      )}
    </div>
  )
}
