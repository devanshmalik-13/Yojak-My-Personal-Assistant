import type { Reminder } from "../types";
import { reminderRepository } from "../repositories/reminderRepository";
import { notificationService } from "./notificationService";
import { nextReminderOccurrence } from "./reminderRecurrence";
import { isValidLocalDate, isValidTime, requireText } from "./validation";

export { nextReminderOccurrence } from "./reminderRecurrence";
export const reminderService={
  async save(reminder:Reminder):Promise<Reminder>{requireText(reminder.message,"Reminder message");if(!isValidLocalDate(reminder.date))throw new Error("Choose a valid reminder date");if(!isValidTime(reminder.time))throw new Error("Choose a valid reminder time");if(reminder.frequency==="once"&&!nextReminderOccurrence(reminder.date,reminder.time,"once"))throw new Error("One-time reminders must be scheduled in the future");const saved=await reminderRepository.save(reminder);await notificationService.scheduleReminder(saved);return saved;},
  async update(id:string,changes:Partial<Reminder>):Promise<Reminder>{const current=await reminderRepository.getById(id);if(!current)throw new Error("Reminder not found");return this.save({...current,...changes,id});},
  async delete(id:string):Promise<void>{await notificationService.cancelForEntity("reminder",id);await reminderRepository.delete(id);},
  async deleteAll():Promise<void>{const reminders=await reminderRepository.getAll();await Promise.all(reminders.map(reminder=>notificationService.cancelForEntity("reminder",reminder.id)));await reminderRepository.deleteAll();},
};
