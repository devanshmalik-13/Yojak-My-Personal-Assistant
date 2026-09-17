import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { openMemoryDatabase, type LocalSqliteDatabase } from "../src/database/driver";
import { migrate } from "../src/database/migrations";
import { setDatabaseForTests } from "../src/database/database";
import { clearBrowserPersistence } from "../src/database/indexedDb";

let database:LocalSqliteDatabase|undefined;
beforeEach(async()=>{database=await openMemoryDatabase();await migrate(database);setDatabaseForTests(database);});
afterEach(async()=>{database?.close();database=undefined;setDatabaseForTests();await clearBrowserPersistence().catch(()=>undefined);});
