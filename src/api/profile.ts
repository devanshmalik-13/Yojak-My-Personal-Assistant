import type { NotificationSettings, ThemeMode, UserProfile } from "../types";
import { userRepository } from "../repositories/userRepository";
import { settingsRepository } from "../repositories/settingsRepository";
import { profileService } from "../services/profileService";
export async function getProfile():Promise<UserProfile>{const user=await userRepository.get();if(!user)throw new Error("No local profile exists");return user.profile;}
export async function updateProfile(changes:Partial<UserProfile>):Promise<UserProfile>{const current=await getProfile();const next={...current,...changes};await profileService.update(next);return next;}
export async function getNotificationSettings():Promise<NotificationSettings>{return(await settingsRepository.get()).notificationSettings;}
export async function updateNotificationSettings(changes:Partial<NotificationSettings>):Promise<NotificationSettings>{const current=await settingsRepository.get();const next={...current.notificationSettings,...changes};await settingsRepository.update({notificationSettings:next});return next;}
export async function setTheme(theme:ThemeMode):Promise<{theme:ThemeMode}>{await settingsRepository.update({theme});return{theme};}
