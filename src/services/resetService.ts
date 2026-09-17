import { clearApplicationTables } from "../database/database";
import { localFileService } from "./fileService";
import { notificationService } from "./notificationService";

export const resetService={async resetApplication():Promise<void>{await notificationService.cancelAll();await clearApplicationTables();await localFileService.clearAll();}};
