export interface AudioFile {
  id: string
  filename: string
  storage_path?: string | null
  title?: string | null
  artist?: string | null
  duration_seconds?: number | null
  sample_rate?: number | null
  channels?: number | null
  bitrate?: number | null
  format?: string | null
  created_at: string
}

export interface SeparationJob {
  id: string
  file_id: string
  model: string
  stems: string[]
  overlap: number
  device?: string | null
  status: string
  progress: number
  elapsed_seconds: number
  eta_seconds?: number | null
  error_message?: string | null
  result_dir?: string | null
  stem_paths?: Record<string, string> | null
  start_time?: number | null
  end_time?: number | null
  created_at: string
  updated_at: string
}

export interface BatchSeparationJob {
  batch_id: string
  job_ids: string[]
}

export interface ModelInfo {
  id: string
  name: string
  stem_count: number
  stems: string[]
  size_mb?: number | null
  quality_score?: number | null
  speed_score?: string | null
  installed: boolean
  default: boolean
}

export interface ModelDownloadProgress {
  model_id: string
  status: string
  progress: number
  bytes_downloaded: number
  total_bytes: number
  eta_seconds?: number | null
  error_message?: string | null
}

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg' | 'm4a'

export type StemMode = '2stem' | '4stem' | '6stem'

export type QualityPreset = 'high' | 'balanced' | 'draft'

export interface ExportQuality {
  bit_depth?: number
  sample_rate?: number
  bitrate?: number
  mode?: 'cbr' | 'vbr'
  compression?: number
  quality?: number
}

export interface StemState {
  volume: number
  muted: boolean
  solo: boolean
  selected: boolean
}

export interface RegionSelection {
  start: number
  end: number
}
