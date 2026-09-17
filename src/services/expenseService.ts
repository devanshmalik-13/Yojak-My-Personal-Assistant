import { transactionRepository } from "../repositories/transactionRepository";
export const expenseService={getMonthlySummary:(month:string)=>transactionRepository.getMonthlySummary(month)};
