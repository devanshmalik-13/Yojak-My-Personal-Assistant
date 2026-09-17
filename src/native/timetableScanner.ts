import { Capacitor, registerPlugin } from '@capacitor/core'
import type { TimetableOcrResult } from '../services/timetableImageParser'

interface TimetableScannerPlugin {
  recognizeImage(options: { imageData: string }): Promise<TimetableOcrResult>
  recognizeDocument(options: { documentData: string; pageIndex?: number }): Promise<TimetableOcrResult>
  scanTimetable(): Promise<TimetableOcrResult>
}

export async function recognizeTimetableDocument(documentData: string, pageIndex = 0) {
  if (!canScanTimetableOnDevice()) {
    throw new Error('Automatic timetable scanning is available in the Android app.')
  }
  return scanner.recognizeDocument({ documentData, pageIndex })
}

const scanner = registerPlugin<TimetableScannerPlugin>('TimetableScanner')

export function canScanTimetableOnDevice() {
  return Capacitor.isNativePlatform()
}

export async function recognizeTimetableImage(imageData: string) {
  if (!canScanTimetableOnDevice()) {
    throw new Error('Automatic timetable scanning is available in the Android app.')
  }
  return scanner.recognizeImage({ imageData })
}

export async function scanTimetablePhoto() {
  if (!canScanTimetableOnDevice()) {
    throw new Error('Smart camera scanning is available in the Android app.')
  }
  return scanner.scanTimetable()
}
