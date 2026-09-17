import type { UserProfile } from "../types";
import { profileService } from "../services/profileService";
import { userRepository } from "../repositories/userRepository";

export type RegisterPayload=UserProfile;
export interface AuthResponse{token:"local";user:UserProfile&{id:string};}
export async function register(payload:RegisterPayload):Promise<AuthResponse>{await profileService.completeOnboarding(payload);const user=await userRepository.get();if(!user)throw new Error("Local profile was not created");return{token:"local",user:{...user.profile,id:user.id}};}
export async function login():Promise<AuthResponse>{const user=await userRepository.get();if(!user)throw new Error("No local profile exists");await userRepository.setOnboardingComplete(true);return{token:"local",user:{...user.profile,id:user.id}};}
export async function logout():Promise<void>{await userRepository.setOnboardingComplete(false);}
export async function getMe():Promise<UserProfile&{id:string}>{const user=await userRepository.get();if(!user)throw new Error("No local profile exists");return{...user.profile,id:user.id};}
