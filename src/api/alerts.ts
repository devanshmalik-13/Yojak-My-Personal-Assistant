import { alertRepository } from "../repositories/alertRepository";
export const getAlerts=()=>alertRepository.getAll();
export const markAllAlertsRead=()=>alertRepository.markAllRead();
