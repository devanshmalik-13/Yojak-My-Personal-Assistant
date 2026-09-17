import { Capacitor, registerPlugin } from '@capacitor/core'

interface FileOpenerPlugin {
  open(options: { path: string; mimeType: string }): Promise<void>
}

const FileOpener = registerPlugin<FileOpenerPlugin>('FileOpener')

function inferredMime(path = ''): string {
  const ext = path.toLowerCase().split('.').pop()
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' } as Record<string, string>)[ext || ''] || 'application/octet-stream'
}

export async function openSavedFile(file: { localPath?: string; url?: string; fileType?: string }): Promise<void> {
  if (Capacitor.isNativePlatform() && file.localPath) {
    await FileOpener.open({ path: file.localPath, mimeType: file.fileType && file.fileType !== 'application/octet-stream' ? file.fileType : inferredMime(file.localPath) })
    return
  }
  if (!file.url) throw new Error('The saved file could not be found')
  window.open(file.url, '_blank', 'noopener,noreferrer')
}
