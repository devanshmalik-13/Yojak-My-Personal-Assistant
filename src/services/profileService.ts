import type { UserProfile } from "../types";
import { userRepository } from "../repositories/userRepository";
import { settingsRepository } from "../repositories/settingsRepository";
import { categoryRepository } from "../repositories/categoryRepository";

export class ValidationError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Please check the form");
    this.name = "ValidationError";
  }
}

export function validateProfile(profile: UserProfile): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!profile.name.trim()) errors.name = "Name is required";
  const phone = profile.phone.replace(/\s/g, "");
  if (!phone) errors.phone = "Phone number is required";
  else if (!/^\+?[0-9]{10,13}$/.test(phone)) errors.phone = "Enter a valid phone number";
  if (profile.gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.gmail)) errors.gmail = "Enter a valid email address";
  if (!profile.college.trim()) errors.college = "College name is required";
  if (!profile.course.trim()) errors.course = "Course name is required";
  const entry = Number(profile.yearOfEntry);
  const passing = Number(profile.expectedYearOfPassing);
  if (!Number.isInteger(entry)) errors.yearOfEntry = "Choose a valid joining year";
  if (!Number.isInteger(passing)) errors.expectedYearOfPassing = "Choose a valid passing year";
  else if (Number.isInteger(entry) && passing < entry) errors.expectedYearOfPassing = "Passing year cannot be before joining year";
  return errors;
}

export const profileService = {
  async completeOnboarding(profile: UserProfile): Promise<void> {
    const errors = validateProfile(profile); if (Object.keys(errors).length) throw new ValidationError(errors);
    const userId = await userRepository.save(profile, true);
    await settingsRepository.ensure(userId);
    await categoryRepository.ensureDefaults(userId);
  },
  async update(profile: UserProfile): Promise<void> {
    const errors = validateProfile(profile); if (Object.keys(errors).length) throw new ValidationError(errors);
    await userRepository.save(profile, true);
  },
};
