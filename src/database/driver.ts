import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { loadDatabaseBytes, saveDatabaseBytes } from "./indexedDb";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export class LocalSqliteDatabase {
  private transactionDepth = 0;

  constructor(
    private sqlite: SqlJsStatic,
    private database: Database,
    private readonly persistDatabase?: (bytes: Uint8Array) => Promise<void>,
  ) {}

  async exec(sql: string): Promise<void> {
    this.database.exec(sql);
    await this.persistIfNeeded();
  }

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    this.database.run(sql, params);
    const changes = this.database.getRowsModified();
    const row = this.first<{ id: number }>("SELECT last_insert_rowid() AS id");
    await this.persistIfNeeded();
    return { changes, lastInsertRowId: row?.id ?? 0 };
  }

  all<T extends Record<string, unknown>>(sql: string, params: SqlParams = []): T[] {
    const statement = this.database.prepare(sql, params);
    const rows: T[] = [];
    try {
      while (statement.step()) rows.push(statement.getAsObject() as T);
    } finally {
      statement.free();
    }
    return rows;
  }

  first<T extends Record<string, unknown>>(sql: string, params: SqlParams = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const outermost = this.transactionDepth === 0;
    if (outermost) this.database.run("BEGIN IMMEDIATE");
    this.transactionDepth += 1;
    try {
      const result = await operation();
      this.transactionDepth -= 1;
      if (outermost) {
        this.database.run("COMMIT");
        await this.persist();
      }
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      if (outermost) this.database.run("ROLLBACK");
      throw error;
    }
  }

  exportBytes(): Uint8Array {
    return this.database.export();
  }

  async replaceBytes(bytes: Uint8Array): Promise<void> {
    const replacement = new this.sqlite.Database(bytes);
    replacement.exec("PRAGMA foreign_keys = ON");
    const integrity = replacement.exec("PRAGMA integrity_check");
    const result = integrity[0]?.values[0]?.[0];
    if (result !== "ok") {
      replacement.close();
      throw new Error("The backup database failed its integrity check");
    }
    this.database.close();
    this.database = replacement;
    await this.persist();
  }

  async persist(): Promise<void> {
    if (this.persistDatabase) await this.persistDatabase(this.database.export());
  }

  close(): void {
    this.database.close();
  }

  private async persistIfNeeded(): Promise<void> {
    if (this.transactionDepth === 0) await this.persist();
  }
}

let sqlRuntime: Promise<SqlJsStatic> | undefined;

export function getSqlRuntime(): Promise<SqlJsStatic> {
  const runtimeWasmUrl = typeof process !== "undefined" && process.versions?.node && wasmUrl.startsWith("/")
    ? `${process.cwd()}${wasmUrl}`
    : wasmUrl;
  sqlRuntime ??= initSqlJs({ locateFile: () => runtimeWasmUrl });
  return sqlRuntime;
}

export async function openPersistentDatabase(): Promise<LocalSqliteDatabase> {
  const sqlite = await getSqlRuntime();
  const bytes = Capacitor.isNativePlatform() ? await loadNativeDatabaseBytes() : await loadDatabaseBytes();
  const database = bytes ? new sqlite.Database(bytes) : new sqlite.Database();
  return new LocalSqliteDatabase(sqlite, database, Capacitor.isNativePlatform() ? saveNativeDatabaseBytes : saveDatabaseBytes);
}

export async function openMemoryDatabase(bytes?: Uint8Array): Promise<LocalSqliteDatabase> {
  const sqlite = await getSqlRuntime();
  return new LocalSqliteDatabase(sqlite, bytes ? new sqlite.Database(bytes) : new sqlite.Database());
}

async function loadNativeDatabaseBytes():Promise<Uint8Array|undefined>{try{const value=await Filesystem.readFile({path:"app-data/database.sqlite",directory:Directory.Data});if(typeof value.data!=="string")return new Uint8Array(await value.data.arrayBuffer());const binary=atob(value.data);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}catch{return undefined;}}
async function saveNativeDatabaseBytes(bytes:Uint8Array):Promise<void>{let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));await Filesystem.writeFile({path:"app-data/database.sqlite",data:btoa(binary),directory:Directory.Data,recursive:true});}
