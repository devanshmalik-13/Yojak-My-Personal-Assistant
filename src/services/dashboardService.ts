import { timetableRepository } from "../repositories/timetableRepository"
import { assignmentService } from "./assignmentService"
import { competitionRepository } from "../repositories/competitionRepository"
import { reminderRepository } from "../repositories/reminderRepository"
import { alertRepository } from "../repositories/alertRepository"
import { attendanceService } from "./attendanceService"
import { expenseService } from "./expenseService"
import { localToday } from "./validation"

export const dashboardService = {
  async getDashboard(date = localToday()) {
    const [
      timetable,
      assignments,
      competitions,
      reminders,
      alerts,
      attendance,
      expenses,
    ] = await Promise.all([
      timetableRepository.getActive(date),
      assignmentService.getAll(),
      competitionRepository.getAll(),
      reminderRepository.getAll(),
      alertRepository.getAll(),
      attendanceService.getStatistics(),
      expenseService.getMonthlySummary(date.slice(0, 7)),
    ])
    const day = new Date(`${date}T12:00:00`).getDay()
    return {
      todaysTimetable: timetable.slots.filter((s) => s.dayOfWeek === day),
      attendance,
      upcomingAssignments: assignments
        .filter((a) => a.status !== "completed")
        .slice(0, 5),
      upcomingCompetitions: competitions
        .filter((c) => c.status === "upcoming")
        .slice(0, 5),
      upcomingReminders: reminders.slice(0, 5),
      unreadAlerts: alerts.filter((a) => !a.read).length,
      expenseSummary: expenses,
    }
  },
}
