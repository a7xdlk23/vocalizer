import type {
  AudioFile,
  BatchSeparationJob,
  ExportFormat,
  ExportQuality,
  ModelDownloadProgress,
  ModelInfo,
  QualityPreset,
  SeparationJob,
  StemMode,
} from '../types'

const API_ROOT = 'http://127.0.0.1:8000'
const API_BASE = `${API_ROOT}/api/v1`

/** Typed API error that records exactly how a request failed. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'timeout' | 'http',
    readonly method: string,
    readonly path: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions extends RequestInit {
  /** Abort the request after this many ms (default 120s). */
  timeoutMs?: number
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 120_000, ...init } = options
  const url = `${API_BASE}${path}`
  const method = (init.method ?? 'GET').toUpperCase()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()

  let res: Response
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? controller.signal })
  } catch (err) {
    // fetch() only rejects for network-level failures (connection refused/reset,
    // DNS, CORS, or an aborted request) — never for HTTP error status codes.
    if (controller.signal.aborted) {
      const msg = `Request timed out after ${(timeoutMs / 1000).toFixed(0)}s: ${method} ${path}`
      console.error('[api] timeout', { method, url, timeoutMs })
      throw new ApiError(msg, 'timeout', method, path)
    }
    const detail = err instanceof Error ? err.message : String(err)
    const msg =
      `Cannot reach the audio engine (${method} ${path}). ` +
      `The backend may have crashed or restarted — check the backend logs. [${detail}]`
    console.error('[api] network failure', { method, url, error: detail })
    throw new ApiError(msg, 'network', method, path)
  } finally {
    clearTimeout(timer)
  }

  const ms = Math.round(performance.now() - started)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const msg = `API error ${res.status} ${res.statusText} (${method} ${path})${text ? `: ${text}` : ''}`
    console.error('[api] http error', { method, url, status: res.status, ms, body: text })
    throw new ApiError(msg, 'http', method, path, res.status, text)
  }

  console.debug('[api] ok', { method, url, status: res.status, ms })
  return res.json() as Promise<T>
}

/** Single, quiet probe of the backend's /health endpoint. */
async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_ROOT}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Poll the backend until it answers /health, or until the timeout elapses.
 *
 * The bundled Python backend (PyInstaller + torch/demucs) has a slow cold
 * start — it can take tens of seconds to import torch and bind the port. The
 * webview loads almost instantly, so without this wait the first API calls
 * race ahead of the server, fail with connection-refused, and the UI is left
 * permanently empty. Returns true once the backend is reachable.
 */
export async function waitForBackend(
  { timeoutMs = 120_000, intervalMs = 750 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await checkHealth()) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export async function listFiles(): Promise<AudioFile[]> {
  return request('/files')
}

export async function uploadFile(file: File): Promise<AudioFile> {
  const formData = new FormData()
  formData.append('upload', file)
  return request('/files/upload', {
    method: 'POST',
    body: formData,
  })
}

export async function uploadBlob(blob: Blob, filename: string): Promise<AudioFile> {
  const file = new File([blob], filename, { type: blob.type || 'audio/wav' })
  return uploadFile(file)
}

export async function deleteFile(id: string): Promise<void> {
  await request(`/files/${id}`, { method: 'DELETE' })
}

export async function listModels(): Promise<ModelInfo[]> {
  return request('/models')
}

export async function downloadModel(modelId: string): Promise<void> {
  await request('/models/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId }),
  })
}

export async function getModelDownloadProgress(modelId: string): Promise<ModelDownloadProgress> {
  return request(`/models/download/${modelId}`)
}

export interface SeparationRequest {
  file_id: string
  model: string
  stems?: string[]
  overlap?: number
  device?: string
  segment_duration?: number
  start_time?: number
  end_time?: number
  two_stem?: string
}

export async function startSeparation(req: SeparationRequest): Promise<SeparationJob> {
  return request('/separate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export interface BatchSeparationRequest {
  file_ids: string[]
  model: string
  stems?: string[]
  overlap?: number
  device?: string
  segment_duration?: number
  start_time?: number
  end_time?: number
}

export async function startBatchSeparation(req: BatchSeparationRequest): Promise<BatchSeparationJob> {
  return request('/separate/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export async function getJob(jobId: string): Promise<SeparationJob> {
  return request(`/separate/${jobId}`)
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/separate/${jobId}/cancel`, { method: 'POST' })
}

export interface ExportRequest {
  job_id: string
  format: ExportFormat
  quality: ExportQuality
  output_dir?: string
  selected_stems?: string[]
  merge?: boolean
  zip_archive?: boolean
  base_name?: string
}

export async function exportStems(req: ExportRequest): Promise<{ export_paths: Record<string, string> }> {
  return request('/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export function previewUrl(path: string): string {
  return `${API_BASE}/preview/${encodeURIComponent(path)}`
}

export function qualityForPreset(format: ExportFormat, preset: QualityPreset): ExportQuality {
  switch (format) {
    case 'wav':
      return preset === 'high' ? { bit_depth: 32, sample_rate: 48000 }
        : preset === 'balanced' ? { bit_depth: 24, sample_rate: 44100 }
        : { bit_depth: 16, sample_rate: 44100 }
    case 'mp3':
      return preset === 'high' ? { bitrate: 320, mode: 'cbr' }
        : preset === 'balanced' ? { bitrate: 256, mode: 'cbr' }
        : { bitrate: 192, mode: 'cbr' }
    case 'flac':
      return preset === 'high' ? { compression: 8, bit_depth: 24 }
        : preset === 'balanced' ? { compression: 5, bit_depth: 24 }
        : { compression: 3, bit_depth: 16 }
    case 'ogg':
      return preset === 'high' ? { quality: 9 }
        : preset === 'balanced' ? { quality: 6 }
        : { quality: 3 }
    case 'm4a':
      return preset === 'high' ? { bitrate: 320 }
        : preset === 'balanced' ? { bitrate: 256 }
        : { bitrate: 128 }
  }
}

export async function deleteModel(modelId: string): Promise<void> {
  await request(`/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' })
}

export interface ModelImportRequest {
  name: string
  path: string
  stems: string[]
}

export async function importModel(req: ModelImportRequest): Promise<ModelInfo> {
  return request('/models/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export function twoStemValue(mode: StemMode): string | undefined {
  return mode === '2stem' ? 'vocals' : undefined
}

export interface OptimizationStatus {
  model_id: string
  status: 'not_started' | 'queued' | 'loading' | 'exporting' | 'verifying' | 'completed' | 'failed'
  progress: number
  onnx_path: string | null
  error: string | null
}

export async function optimizeModel(modelId: string): Promise<void> {
  await request(`/models/${encodeURIComponent(modelId)}/optimize`, { method: 'POST' })
}

export async function getOptimizationStatus(modelId: string): Promise<OptimizationStatus> {
  return request(`/models/${encodeURIComponent(modelId)}/optimize`)
}
