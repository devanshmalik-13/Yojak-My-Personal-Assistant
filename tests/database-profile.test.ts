import { describe,expect,it } from "vitest";
import { getDatabase } from "../src/database/database";
import { CURRENT_SCHEMA_VERSION, DEFAULT_CATEGORIES } from "../src/database/schema";
import { migrate } from "../src/database/migrations";
import { profileService, validateProfile, ValidationError } from "../src/services/profileService";
import { categoryRepository } from "../src/repositories/categoryRepository";
import { settingsRepository } from "../src/repositories/settingsRepository";
import { profile } from "./helpers";

describe("database and local profile",()=>{
  it("runs versioned migrations idempotently",async()=>{const db=await getDatabase();await migrate(db);await migrate(db);expect(db.first<{version:number}>("SELECT version FROM schema_version")?.version).toBe(CURRENT_SCHEMA_VERSION);});
  it("creates one profile, settings, and default categories without duplicates",async()=>{await profileService.completeOnboarding(profile);await profileService.completeOnboarding(profile);await categoryRepository.ensureDefaults();const db=await getDatabase();expect(db.first<{count:number}>("SELECT COUNT(*) count FROM users")?.count).toBe(1);expect((await categoryRepository.getAll()).length).toBe(DEFAULT_CATEGORIES.length);expect((await settingsRepository.get()).timezone).toBe("Asia/Kolkata");});
  it("rejects a passing year before the joining year",async()=>{const invalid={...profile,yearOfEntry:"2028",expectedYearOfPassing:"2027"};expect(validateProfile(invalid).expectedYearOfPassing).toMatch(/cannot be before/);await expect(profileService.completeOnboarding(invalid)).rejects.toBeInstanceOf(ValidationError);});
});
