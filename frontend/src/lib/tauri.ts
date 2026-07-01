import { isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readFile } from '@tauri-apps/plugin-fs'

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'aiff', 'wma', 'opus']

export function inTauri(): boolean {
  return typeof window !== 'undefined' && isTauri()
}

export interface NativeFile {
  path: string
  name: string
  blob: Blob
}

function extension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(extension(name))
}

function mimeType(name: string): string {
  const ext = extension(name)
  const map: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    aiff: 'audio/aiff',
    wma: 'audio/x-ms-wma',
    opus: 'audio/opus',
  }
  return map[ext] || 'audio/wav'
}

export async function pathToBlob(path: string, name?: string): Promise<Blob> {
  const bytes = await readFile(path)
  return new Blob([bytes], { type: mimeType(name || path) })
}

export async function openAudioFiles(): Promise<NativeFile[]> {
  if (!inTauri()) return []
  const paths = await open({
    multiple: true,
    filters: [
      {
        name: 'Audio',
        extensions: AUDIO_EXTENSIONS,
      },
    ],
  })
  if (!paths) return []
  const list = Array.isArray(paths) ? paths : [paths]
  const files: NativeFile[] = []
  for (const path of list) {
    const name = path.replace(/\\/g, '/').split('/').pop() || 'audio.wav'
    const blob = await pathToBlob(path, name)
    files.push({ path, name, blob })
  }
  return files
}

export async function openAudioFolder(): Promise<NativeFile[]> {
  if (!inTauri()) return []
  const dir = await open({ directory: true })
  if (!dir) return []
  const files: NativeFile[] = []

  async function walk(current: string) {
    const entries = await readDir(current)
    for (const entry of entries) {
      const childPath = `${current}\\${entry.name}`
      if (entry.isDirectory) {
        await walk(childPath)
      } else if (entry.isFile && isAudioFile(entry.name)) {
        const blob = await pathToBlob(childPath, entry.name)
        files.push({ path: childPath, name: entry.name, blob })
      }
    }
  }

  await walk(dir)
  return files
}

export async function pickOutputDirectory(): Promise<string | null> {
  if (!inTauri()) return null
  const dir = await open({ directory: true })
  return dir || null
}
