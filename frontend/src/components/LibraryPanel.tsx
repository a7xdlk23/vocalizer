import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Music2, Search, Trash2, FolderOpen, FilePlus2, UploadCloud, Zap, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { openAudioFiles, openAudioFolder, inTauri } from '../lib/tauri'
import type { AudioFile } from '../types'

export function LibraryPanel() {
  const {
    files,
    selectedFileId,
    selectedFileIds,
    isUploading,
    uploadFile,
    uploadNativeFiles,
    setSelectedFileId,
    toggleFileSelection,
    selectAllFiles,
    clearFileSelection,
    startBatchSeparation,
    deleteFile,
  } = useAppStore()

  const [query, setQuery] = useState('')

  const onDrop = useCallback(
    (accepted: File[]) => accepted.forEach((f) => uploadFile(f)),
    [uploadFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.wav', '.mp3', '.flac', '.aac', '.m4a', '.ogg', '.aiff', '.wma', '.opus'],
    },
    multiple: true,
    noClick: true,
  })

  const filtered = query.trim()
    ? files.filter(
        (f) =>
          f.filename.toLowerCase().includes(query.toLowerCase()) ||
          f.title?.toLowerCase().includes(query.toLowerCase()) ||
          f.artist?.toLowerCase().includes(query.toLowerCase()),
      )
    : files

  const handleOpenFiles = async () => {
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

  const handleOpenFolder = async () => {
    if (!inTauri()) return
    const picked = await openAudioFolder()
    if (picked.length) uploadNativeFiles(picked.map((f) => ({ blob: f.blob, name: f.name })))
  }

  const allSelected = files.length > 0 && files.every((f) => selectedFileIds.includes(f.id))
  const batchCount = selectedFileIds.length

  return (
    <div className="panel" style={{ height: '100%' }} {...getRootProps()}>
      <input {...getInputProps()} />

      <div className="panel-header">
        <span className="panel-title">Library</span>
        {files.length > 0 && <span className="panel-count">{files.length}</span>}
        {batchCount > 1 && (
          <span
            className="panel-count"
            style={{ background: 'var(--accent)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
            onClick={clearFileSelection}
            title="Clear selection"
          >
            {batchCount} sel.
            <X size={9} />
          </span>
        )}
        {isUploading && (
          <span className="spin" style={{ color: 'var(--accent)', display: 'inline-flex' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        )}
      </div>

      <div className="search-wrap">
        <Search className="search-icon" size={13} />
        <input
          type="text"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search library"
        />
      </div>

      <div className="drop-root">
        {isDragActive && (
          <div className="drop-overlay">
            <div className="drop-overlay-text">
              <UploadCloud size={18} />
              Drop audio files here
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <Music2 className="empty-state-icon" size={42} />
            {files.length === 0 ? (
              <>
                <p className="empty-state-title">No audio files yet</p>
                <p className="empty-state-sub">
                  Drag &amp; drop files here<br />or use the buttons below
                </p>
              </>
            ) : (
              <p className="empty-state-title">No results for "{query}"</p>
            )}
          </div>
        ) : (
          <div className="file-list scroll" style={{ flex: 1 }}>
            {filtered.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                selected={file.id === selectedFileId}
                batchSelected={selectedFileIds.includes(file.id)}
                onSelect={() => setSelectedFileId(file.id)}
                onToggle={() => toggleFileSelection(file.id)}
                onDelete={() => deleteFile(file.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="library-footer">
        <button onClick={handleOpenFiles} title="Open audio files">
          <FilePlus2 size={13} />
          Open Files
        </button>
        <button onClick={handleOpenFolder} disabled={!inTauri()} title="Open folder of audio files">
          <FolderOpen size={13} />
          Folder
        </button>
        {files.length > 0 && (
          <button
            onClick={allSelected ? clearFileSelection : selectAllFiles}
            title={allSelected ? 'Deselect all' : 'Select all'}
            style={{ marginLeft: 'auto' }}
          >
            {allSelected ? 'Deselect' : 'All'}
          </button>
        )}
        {batchCount > 1 && (
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={startBatchSeparation}
            title={`Separate ${batchCount} files`}
          >
            <Zap size={12} />
            {batchCount}
          </button>
        )}
      </div>
    </div>
  )
}

function FileItem({
  file,
  selected,
  batchSelected,
  onSelect,
  onToggle,
  onDelete,
}: {
  file: AudioFile
  selected: boolean
  batchSelected: boolean
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const duration =
    file.duration_seconds != null
      ? `${Math.floor(file.duration_seconds / 60)}:${String(Math.floor(file.duration_seconds % 60)).padStart(2, '0')}`
      : null

  const displayName = file.title || file.filename.replace(/\.[^.]+$/, '')

  return (
    <div
      className={`file-item${selected ? ' selected' : ''}${batchSelected ? ' batch-selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      aria-selected={selected}
    >
      <input
        type="checkbox"
        className="file-check"
        checked={batchSelected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${file.filename} for batch`}
        tabIndex={-1}
      />
      <Music2 className="file-icon" size={15} />
      <div className="file-info">
        <div className="file-name truncate">{displayName}</div>
        <div className="file-meta">
          {file.artist && <span className="truncate" style={{ maxWidth: 80 }}>{file.artist}</span>}
          {file.artist && (duration || file.format) && <span className="file-meta-sep">·</span>}
          {duration && <span className="tabular">{duration}</span>}
          {duration && file.format && <span className="file-meta-sep">·</span>}
          {file.format && <span>{file.format}</span>}
        </div>
      </div>
      <button
        className="file-delete icon-btn btn-sm"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        aria-label={`Remove ${file.filename}`}
        title="Remove from library"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
