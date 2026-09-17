import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { createId } from "../database/ids";
import { clearLocalFiles, deleteLocalFile, getLocalFile, listLocalFiles, putLocalFile } from "../database/indexedDb";

export const MAX_LOCAL_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain",
  "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword", "text/csv", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".zip", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]);

function extension(name:string):string{const match=name.toLowerCase().match(/\.[a-z0-9]{1,8}$/);return match?.[0]??"";}
const SAFE_LOCAL_PATH=/^app-data\/(profile|assignments|competitions)\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\.[a-z0-9]{1,8}$/;
export function isSafeLocalFilePath(path:string):boolean{return SAFE_LOCAL_PATH.test(path);}
function safePath(owner:string,ownerId:string,file:File):string{if(!/^[a-zA-Z0-9_-]{1,128}$/.test(ownerId))throw new Error("Invalid file owner");const suffix=extension(file.name);if(!suffix)throw new Error("Choose a file with a valid extension");return `${owner}/${ownerId}/${createId()}${suffix}`;}
function requireSafeLocalFilePath(path:string):void{if(!isSafeLocalFilePath(path))throw new Error("Invalid local file path");}

async function blobToBase64(blob:Blob):Promise<string>{const buffer=await blob.arrayBuffer();let binary="";const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function base64ToBlob(value:string,type="application/octet-stream"):Blob{const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type});}

async function nativeList(path=""):Promise<{path:string;blob:Blob}[]>{let result;try{result=await Filesystem.readdir({path,directory:Directory.Data});}catch{return [];}const files:{path:string;blob:Blob}[]=[];for(const entry of result.files){const child=path?`${path}/${entry.name}`:entry.name;if(child==="app-data/database.sqlite"||child.startsWith("app-data/backups"))continue;if(entry.type==="directory")files.push(...await nativeList(child));else if(child.startsWith("app-data/")){const data=await Filesystem.readFile({path:child,directory:Directory.Data});if(typeof data.data==="string")files.push({path:child,blob:base64ToBlob(data.data)});}}return files;}

export const localFileService={
  async save(owner:"profile"|"assignments"|"competitions",ownerId:string,file:File):Promise<{localPath:string;url:string}>{
    if(file.size>MAX_LOCAL_FILE_SIZE)throw new Error("Choose a file smaller than 25 MB");
    if(!ALLOWED_TYPES.has(file.type)&&!ALLOWED_EXTENSIONS.has(extension(file.name)))throw new Error("This file type is not supported");
    const relative=safePath(owner,ownerId,file);const localPath=`app-data/${relative}`;
    if(Capacitor.isNativePlatform())await Filesystem.writeFile({path:localPath,data:await blobToBase64(file),directory:Directory.Data,recursive:true});else await putLocalFile(localPath,file);
    return{localPath,url:await this.getDisplayUrl(localPath)};
  },
  async getDisplayUrl(localPath:string):Promise<string>{
    if(!localPath)return"";
    if(localPath.startsWith("blob:"))return localPath;
    if(/^data:image\/(png|jpeg|webp);base64,/i.test(localPath))return localPath;
    requireSafeLocalFilePath(localPath);
    if(Capacitor.isNativePlatform()){const result=await Filesystem.getUri({path:localPath,directory:Directory.Data});return Capacitor.convertFileSrc(result.uri);}
    const blob=await getLocalFile(localPath);return blob?URL.createObjectURL(blob):"";
  },
  async delete(localPath:string):Promise<void>{if(!localPath)return;requireSafeLocalFilePath(localPath);if(Capacitor.isNativePlatform())await Filesystem.deleteFile({path:localPath,directory:Directory.Data}).catch(()=>undefined);else await deleteLocalFile(localPath);},
  async exportAll():Promise<{path:string;blob:Blob}[]>{return Capacitor.isNativePlatform()?nativeList("app-data"):listLocalFiles();},
  async importFile(path:string,blob:Blob):Promise<void>{requireSafeLocalFilePath(path);if(blob.size>MAX_LOCAL_FILE_SIZE)throw new Error("Local file exceeds the 25 MB limit");if(Capacitor.isNativePlatform())await Filesystem.writeFile({path,data:await blobToBase64(blob),directory:Directory.Data,recursive:true});else await putLocalFile(path,blob);},
  async clearAll():Promise<void>{if(Capacitor.isNativePlatform()){for(const folder of ["profile","assignments","competitions","temp"])await Filesystem.rmdir({path:`app-data/${folder}`,directory:Directory.Data,recursive:true}).catch(()=>undefined);}else await clearLocalFiles();},
};
