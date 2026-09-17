import { Capacitor } from "@capacitor/core"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import { getDatabase } from "../database/database"
import { CURRENT_SCHEMA_VERSION } from "../database/schema"
import { openMemoryDatabase } from "../database/driver"
import { isSafeLocalFilePath, localFileService, MAX_LOCAL_FILE_SIZE } from "./fileService"
import { localToday } from "./validation"

type Manifest = {
  format: "my-personal-assistant-backup"
  version: 1
  schemaVersion: number
  createdAt: string
  files: { path: string; size: number; type: string }[]
}
const MAX_BACKUP_ARCHIVE_SIZE = 100 * 1024 * 1024
const MAX_BACKUP_EXPANDED_SIZE = 250 * 1024 * 1024
const MAX_BACKUP_DATABASE_SIZE = 50 * 1024 * 1024
const MAX_BACKUP_MANIFEST_SIZE = 256 * 1024
const MAX_BACKUP_FILES = 200

type SizedZipEntry = { _data?: { uncompressedSize?: number } }
function declaredSize(entry: unknown): number | undefined {
  const size = (entry as SizedZipEntry)?._data?.uncompressedSize
  return Number.isSafeInteger(size) && size! >= 0 ? size : undefined
}
function validateManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") throw new Error("Backup manifest is invalid")
  const manifest = value as Partial<Manifest>
  if (manifest.format !== "my-personal-assistant-backup" || manifest.version !== 1)
    throw new Error("Unsupported backup format")
  if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion! < 1)
    throw new Error("Backup schema is invalid")
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_BACKUP_FILES)
    throw new Error("Backup contains too many files")
  const seen = new Set<string>()
  let total = 0
  for (const item of manifest.files) {
    if (!item || typeof item !== "object" || !isSafeLocalFilePath(item.path) || seen.has(item.path))
      throw new Error("Backup contains an unsafe or duplicate file path")
    if (!Number.isSafeInteger(item.size) || item.size < 0 || item.size > MAX_LOCAL_FILE_SIZE)
      throw new Error(`Backup file ${item.path} has an invalid size`)
    if (typeof item.type !== "string" || item.type.length > 128)
      throw new Error(`Backup file ${item.path} has an invalid type`)
    seen.add(item.path)
    total += item.size
  }
  if (total > MAX_BACKUP_EXPANDED_SIZE) throw new Error("Backup expands beyond the allowed size")
  return manifest as Manifest
}
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export const backupService = {
  async exportBackup(): Promise<Blob> {
    const { default: JSZip } = await import("jszip")
    const db = await getDatabase()
    const files = await localFileService.exportAll()
    const databaseBytes = db.exportBytes()
    if (databaseBytes.byteLength > MAX_BACKUP_DATABASE_SIZE || files.length > MAX_BACKUP_FILES || files.some(x => x.blob.size > MAX_LOCAL_FILE_SIZE) || files.reduce((sum,x)=>sum+x.blob.size,0) > MAX_BACKUP_EXPANDED_SIZE)
      throw new Error("Local data is too large to export safely")
    const zip = new JSZip()
    zip.file("database.sqlite", databaseBytes)
    const manifest: Manifest = {
      format: "my-personal-assistant-backup",
      version: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      files: files.map((x) => ({
        path: x.path,
        size: x.blob.size,
        type: x.blob.type,
      })),
    }
    zip.file("manifest.json", JSON.stringify(manifest, null, 2))
    for (const file of files)
      zip.file(
        `files/${file.path}`,
        new Uint8Array(await file.blob.arrayBuffer()),
      )
    return zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })
  },
  async saveBackup(): Promise<void> {
    const blob = await this.exportBackup()
    const name = `my-personal-assistant-${localToday()}.mpa-backup.zip`
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: `app-data/backups/${name}`,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
        recursive: true,
      })
      const uri = await Filesystem.getUri({
        path: `app-data/backups/${name}`,
        directory: Directory.Cache,
      })
      await Share.share({
        title: "My Personal Assistant backup",
        url: uri.uri,
        dialogTitle: "Save backup",
      })
    } else {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  },
  async importBackup(file: File | Blob): Promise<void> {
    if (file.size > MAX_BACKUP_ARCHIVE_SIZE) throw new Error("Backup archive exceeds the 100 MB limit")
    const { default: JSZip } = await import("jszip")
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    if (Object.keys(zip.files).length > MAX_BACKUP_FILES + 10) throw new Error("Backup contains too many entries")
    const manifestEntry = zip.file("manifest.json")
    const databaseEntry = zip.file("database.sqlite")
    if (!manifestEntry || !databaseEntry)
      throw new Error("This is not a valid app backup")
    const manifestDeclaredSize = declaredSize(manifestEntry)
    const databaseDeclaredSize = declaredSize(databaseEntry)
    if (manifestDeclaredSize === undefined || manifestDeclaredSize > MAX_BACKUP_MANIFEST_SIZE)
      throw new Error("Backup manifest is too large")
    if (databaseDeclaredSize === undefined || databaseDeclaredSize > MAX_BACKUP_DATABASE_SIZE)
      throw new Error("Backup database is too large")
    let manifestValue: unknown
    try { manifestValue = JSON.parse(await manifestEntry.async("string")) } catch { throw new Error("Backup manifest is invalid") }
    const manifest = validateManifest(manifestValue)
    if (manifest.schemaVersion > CURRENT_SCHEMA_VERSION)
      throw new Error("This backup was created by a newer app version")
    const databaseBytes = await databaseEntry.async("uint8array")
    if (databaseBytes.byteLength !== databaseDeclaredSize) throw new Error("Backup database is incomplete")
    const candidate = await openMemoryDatabase(databaseBytes)
    try {
      const integrity = candidate.first<{ integrity_check: string }>(
        "PRAGMA integrity_check",
      )
      if (integrity?.integrity_check !== "ok")
        throw new Error("Backup database is damaged")
      const version = candidate.first<{ version: number }>(
        "SELECT version FROM schema_version LIMIT 1",
      )?.version
      if (!version || version > CURRENT_SCHEMA_VERSION)
        throw new Error("Backup schema is not supported")
    } finally {
      candidate.close()
    }
    for (const item of manifest.files) {
      const entry = zip.file(`files/${item.path}`)
      if (!entry) throw new Error(`Backup is missing ${item.path}`)
      if (declaredSize(entry) !== item.size) throw new Error(`Backup file ${item.path} has an invalid size`)
      const data = await entry.async("blob")
      if (data.size !== item.size)
        throw new Error(`Backup file ${item.path} is incomplete`)
    }
    const db = await getDatabase()
    const previousDatabase = db.exportBytes()
    const previousFiles = await localFileService.exportAll()
    try {
      await db.replaceBytes(databaseBytes)
      await localFileService.clearAll()
      for (const item of manifest.files) {
        const entry = zip.file(`files/${item.path}`)!
        await localFileService.importFile(item.path, await entry.async("blob"))
      }
    } catch (error) {
      await db.replaceBytes(previousDatabase)
      await localFileService.clearAll()
      for (const item of previousFiles)
        await localFileService.importFile(item.path, item.blob)
      throw error
    }
  },
}
