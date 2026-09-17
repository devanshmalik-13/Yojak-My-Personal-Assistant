import type { Reminder } from "../types";
import { createId } from "../database/ids";
import { reminderRepository } from "../repositories/reminderRepository";
import { reminderService } from "../services/reminderService";
export type CreateReminderPayload=Omit<Reminder,"id">;
export const getReminders=()=>reminderRepository.getAll();
export const createReminder=(x:CreateReminderPayload)=>reminderService.save({...x,id:createId()});
export const updateReminder=(id:string,x:Partial<Reminder>)=>reminderService.update(id,x);
export const deleteReminder=(id:string)=>reminderService.delete(id);
