import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AudioFile,
  ExportFormat,
  ModelDownloadProgress,
  ModelInfo,
  QualityPreset,
  RegionSelection,
  SeparationJob,
  StemMode,
  StemState,
} from '../types'
import * as api from '../api/client'

interface Toast {
  id: string
  msg: string
  type: 'success' | 'error' | 'info'
}

interface AppState {
  files: AudioFile[]
  models: ModelInfo[]
  selectedFileId: string | null
  selectedFileIds: string[]
  currentJobId: string | null
  batchJobIds: string[]
  jobs: Record<string, SeparationJob>
  selectedModel: string
  exportFormat: ExportFormat
  qualityPreset: QualityPreset
  outputDir: string | null
  overlap: number
  segmentDuration: number
  stemMode: StemMode
  device: string
  isUploading: boolean
  error: string | null
  previewPath: string | null
  activeStem: string | null
  stemStates: Record<string, StemState>
  region: RegionSelection | null
  isPlaying: boolean
  playerVolume: number
  playerMuted: boolean
  currentTime: number
  duration: number
  isMergedPreview: boolean
  downloadProgress: Record<string, ModelDownloadProgress>

  setSelectedFileId: (id: string | null) => void
  toggleFileSelection: (id: string) => void
  selectAllFiles: () => void
  clearFileSelection: () => void
  setSelectedModel: (model: string) => void
  setExportFormat: (format: ExportFormat) => void
  setQualityPreset: (preset: QualityPreset) => void
  setOutputDir: (dir: string | null) => void
  setOverlap: (overlap: number) => void
  setSegmentDuration: (duration: number) => void
  setStemMode: (mode: StemMode) => void
  setDevice: (device: string) => void
  setPreviewPath: (path: string | null) => void
  setActiveStem: (stem: string | null) => void
  setRegion: (region: RegionSelection | null) => void

  setIsPlaying: (playing: boolean) => void
  togglePlayPause: () => void
  stopPlayback: () => void
  skip: (seconds: number) => void
  seek: (time: number) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setPlayerVolume: (volume: number) => void
  togglePlayerMuted: () => void
  setIsMergedPreview: (merged: boolean) => void

  setStemVolume: (stem: string, volume: number) => void
  toggleStemMute: (stem: string) => void
  toggleStemSolo: (stem: string) => void
  toggleStemSelected: (stem: string) => void
  resetStemStates: (stems: string[]) => void

  fetchFiles: () => Promise<void>
  uploadFile: (file: File) => Promise<void>
  uploadNativeFiles: (files: { blob: Blob; name: string }[]) => Promise<void>
  deleteFile: (id: string) => Promise<void>

  fetchModels: () => Promise<void>
  downloadModel: (modelId: string) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  importModel: (req: { name: string; path: string; stems: string[] }) => Promise<void>
  pollDownloadProgress: (modelId: string) => void

  startSeparation: () => Promise<void>
  startBatchSeparation: () => Promise<void>
  pollJob: () => Promise<void>
  pollBatchJobs: () => Promise<void>
  cancelJob: () => Promise<void>

  exportStems: (selectedStems?: string[], opts?: { merge?: boolean; zip?: boolean }) => Promise<Record<string, string>>
  clearError: () => void

  toasts: Toast[]
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  files: [],
  models: [],
  selectedFileId: null,
  selectedFileIds: [],
  currentJobId: null,
  batchJobIds: [],
  jobs: {},
  selectedModel: 'htdemucs',
  exportFormat: 'wav',
  qualityPreset: 'balanced',
  outputDir: null,
  overlap: 0.25,
  segmentDuration: 10,
  stemMode: '4stem',
  device: 'auto',
  isUploading: false,
  error: null,
  previewPath: null,
  activeStem: null,
  stemStates: {},
  region: null,
  isPlaying: false,
  playerVolume: 0.8,
  playerMuted: false,
  currentTime: 0,
  duration: 0,
  isMergedPreview: false,
  downloadProgress: {},

  setSelectedFileId: (id) => set({ selectedFileId: id, selectedFileIds: id ? [id] : [] }),
  toggleFileSelection: (id) =>
    set((state) => {
      const selected = new Set(state.selectedFileIds)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return { selectedFileIds: Array.from(selected) }
    }),
  selectAllFiles: () => set((state) => ({ selectedFileIds: state.files.map((f) => f.id) })),
  clearFileSelection: () => set({ selectedFileIds: [] }),

  setSelectedModel: (model) => set({ selectedModel: model }),
  setExportFormat: (format) => set({ exportFormat: format }),
  setQualityPreset: (preset) => set({ qualityPreset: preset }),
  setOutputDir: (dir) => set({ outputDir: dir }),
  setOverlap: (overlap) => set({ overlap: Math.max(0, Math.min(0.9, overlap)) }),
  setSegmentDuration: (duration) => set({ segmentDuration: Math.max(1, duration) }),
  setStemMode: (mode) => set({ stemMode: mode }),
  setDevice: (device) => set({ device }),
  setPreviewPath: (path) => set({ previewPath: path }),
  setActiveStem: (stem) => set({ activeStem: stem }),
  setRegion: (region) => set({ region }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
  stopPlayback: () => set({ isPlaying: false, currentTime: 0 }),
  skip: (seconds) => {
    const { duration, currentTime } = get()
    const next = Math.max(0, Math.min(duration || Infinity, currentTime + seconds))
    set({ currentTime: next })
  },
  seek: (time) => {
    const { duration } = get()
    set({ currentTime: Math.max(0, Math.min(duration || time, time)) })
  },
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setPlayerVolume: (volume) => set({ playerVolume: Math.max(0, Math.min(1, volume)) }),
  togglePlayerMuted: () => set((state) => ({ playerMuted: !state.playerMuted })),
  setIsMergedPreview: (merged) => set({ isMergedPreview: merged }),

  setStemVolume: (stem, volume) =>
    set((state) => ({
      stemStates: {
        ...state.stemStates,
        [stem]: { ...(state.stemStates[stem] || defaultStemState()), volume },
      },
    })),
  toggleStemMute: (stem) =>
    set((state) => {
      const current = state.stemStates[stem] || defaultStemState()
      return {
        stemStates: {
          ...state.stemStates,
          [stem]: { ...current, muted: !current.muted },
        },
      }
    }),
  toggleStemSolo: (stem) =>
    set((state) => {
      const current = state.stemStates[stem] || defaultStemState()
      const soloing = !current.solo
      const next: Record<string, StemState> = { ...state.stemStates }
      Object.keys(next).forEach((key) => {
        next[key] = { ...next[key], solo: key === stem ? soloing : false }
      })
      next[stem] = { ...current, solo: soloing }
      return { stemStates: next }
    }),
  toggleStemSelected: (stem) =>
    set((state) => {
      const current = state.stemStates[stem] || defaultStemState()
      return {
        stemStates: {
          ...state.stemStates,
          [stem]: { ...current, selected: !current.selected },
        },
      }
    }),
  resetStemStates: (stems) =>
    set({
      stemStates: Object.fromEntries(stems.map((s) => [s, defaultStemState()])),
    }),

  fetchFiles: async () => {
    try {
      const files = await api.listFiles()
      set({ files })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  uploadFile: async (file) => {
    set({ isUploading: true, error: null })
    try {
      const uploaded = await api.uploadFile(file)
      set((state) => ({
        files: [uploaded, ...state.files],
        selectedFileId: uploaded.id,
        selectedFileIds: [uploaded.id],
        isUploading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, isUploading: false })
    }
  },

  uploadNativeFiles: async (files) => {
    set({ isUploading: true, error: null })
    try {
      const uploaded: AudioFile[] = []
      for (const { blob, name } of files) {
        const file = await api.uploadBlob(blob, name)
        uploaded.push(file)
      }
      set((state) => ({
        files: [...uploaded.reverse(), ...state.files],
        selectedFileId: uploaded[0]?.id || state.selectedFileId,
        selectedFileIds: uploaded.map((f) => f.id),
        isUploading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, isUploading: false })
    }
  },

  deleteFile: async (id) => {
    try {
      await api.deleteFile(id)
      set((state) => ({
        files: state.files.filter((f) => f.id !== id),
        selectedFileId: state.selectedFileId === id ? null : state.selectedFileId,
        selectedFileIds: state.selectedFileIds.filter((fid) => fid !== id),
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  fetchModels: async () => {
    try {
      const models = await api.listModels()
      set({ models })
      const defaultModel = models.find((m) => m.default)
      if (defaultModel) set({ selectedModel: defaultModel.id })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  downloadModel: async (modelId) => {
    try {
      await api.downloadModel(modelId)
      get().pollDownloadProgress(modelId)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  deleteModel: async (modelId) => {
    try {
      await api.deleteModel(modelId)
      await get().fetchModels()
      get().addToast('Model removed from cache', 'info')
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  importModel: async (req) => {
    const model = await api.importModel(req)
    set((state) => ({ models: [...state.models, model] }))
  },

  pollDownloadProgress: (modelId) => {
    const poll = async () => {
      try {
        const progress = await api.getModelDownloadProgress(modelId)
        set((state) => ({
          downloadProgress: { ...state.downloadProgress, [modelId]: progress },
        }))
        if (progress.status === 'completed' || progress.status === 'failed') {
          await get().fetchModels()
          return
        }
        setTimeout(poll, 1000)
      } catch {
        // Stop polling on error
      }
    }
    poll()
  },

  startSeparation: async () => {
    const {
      selectedFileId,
      selectedModel,
      overlap,
      segmentDuration,
      region,
      stemMode,
      device,
    } = get()
    if (!selectedFileId) {
      set({ error: 'No file selected' })
      return
    }
    try {
      const job = await api.startSeparation({
        file_id: selectedFileId,
        model: selectedModel,
        overlap,
        segment_duration: segmentDuration,
        start_time: region?.start,
        end_time: region?.end,
        two_stem: api.twoStemValue(stemMode),
        device: device === 'auto' ? undefined : device,
      })
      set((state) => ({
        currentJobId: job.id,
        jobs: { ...state.jobs, [job.id]: job },
        error: null,
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  startBatchSeparation: async () => {
    const {
      selectedFileIds,
      selectedModel,
      overlap,
      segmentDuration,
      region,
      device,
    } = get()
    if (selectedFileIds.length === 0) {
      set({ error: 'No files selected' })
      return
    }
    try {
      const batch = await api.startBatchSeparation({
        file_ids: selectedFileIds,
        model: selectedModel,
        overlap,
        segment_duration: segmentDuration,
        start_time: region?.start,
        end_time: region?.end,
        device: device === 'auto' ? undefined : device,
      })
      set((state) => ({
        batchJobIds: [...state.batchJobIds, ...batch.job_ids],
        currentJobId: batch.job_ids[0] || state.currentJobId,
        error: null,
      }))
      for (const jobId of batch.job_ids) {
        const job = await api.getJob(jobId)
        set((state) => ({ jobs: { ...state.jobs, [jobId]: job } }))
      }
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  pollJob: async () => {
    const { currentJobId } = get()
    if (!currentJobId) return
    try {
      const job = await api.getJob(currentJobId)
      set((state) => ({ jobs: { ...state.jobs, [job.id]: job } }))
      if (job.status === 'COMPLETED') {
        const stems = Object.keys(job.stem_paths || {})
        if (stems.length > 0) {
          get().resetStemStates(stems)
          get().setActiveStem(stems[0])
          get().setPreviewPath(job.stem_paths![stems[0]])
        }
      }
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  pollBatchJobs: async () => {
    const { batchJobIds } = get()
    if (batchJobIds.length === 0) return
    try {
      const jobs: Record<string, SeparationJob> = {}
      for (const jobId of batchJobIds) {
        const job = await api.getJob(jobId)
        jobs[jobId] = job
        if (job.status === 'COMPLETED') {
          const stems = Object.keys(job.stem_paths || {})
          if (stems.length > 0 && !get().currentJobId) {
            get().resetStemStates(stems)
            get().setActiveStem(stems[0])
            get().setPreviewPath(job.stem_paths![stems[0]])
          }
        }
      }
      set((state) => ({ jobs: { ...state.jobs, ...jobs } }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  cancelJob: async () => {
    const { currentJobId } = get()
    if (!currentJobId) return
    try {
      await api.cancelJob(currentJobId)
      await get().pollJob()
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  exportStems: async (selectedStems, opts) => {
    const { currentJobId, exportFormat, qualityPreset, outputDir, jobs, stemStates } = get()
    const job = currentJobId ? jobs[currentJobId] : null
    if (!job || job.status !== 'COMPLETED') {
      throw new Error('No completed separation job')
    }

    const targets =
      selectedStems && selectedStems.length > 0
        ? selectedStems
        : Object.entries(stemStates)
            .filter(([, state]) => state.selected)
            .map(([stem]) => stem)

    const quality = api.qualityForPreset(exportFormat, qualityPreset)
    const result = await api.exportStems({
      job_id: job.id,
      format: exportFormat,
      quality,
      output_dir: outputDir || undefined,
      selected_stems: targets.length > 0 ? targets : undefined,
      merge: opts?.merge,
      zip_archive: opts?.zip,
    })
    return result.export_paths
  },

  clearError: () => set({ error: null }),

  toasts: [],
  addToast: (msg, type) =>
    set((state) => ({
      toasts: [...state.toasts, { id: crypto.randomUUID(), msg, type }],
    })),
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'vocalizer-settings',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        exportFormat: state.exportFormat,
        qualityPreset: state.qualityPreset,
        outputDir: state.outputDir,
        overlap: state.overlap,
        segmentDuration: state.segmentDuration,
        stemMode: state.stemMode,
        device: state.device,
        playerVolume: state.playerVolume,
        playerMuted: state.playerMuted,
      }),
    }
  )
)

function defaultStemState(): StemState {
  return { volume: 1, muted: false, solo: false, selected: false }
}
