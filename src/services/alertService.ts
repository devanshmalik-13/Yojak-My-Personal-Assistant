import type { AppState } from "../types"
import { alertRepository } from "../repositories/alertRepository"
import { localToday } from "./validation"

const DAY = 86_400_000
export const alertService = {
  async reconcile(state: AppState): Promise<void> {
    const now = new Date()
    const today = localToday()
    if (state.notificationSettings.assignments) {
      for (const assignment of state.assignments.filter(
        (x) => x.status !== "completed",
      )) {
        const due = new Date(`${assignment.deadline}T23:59:59`)
        const days = Math.ceil((due.getTime() - now.getTime()) / DAY)
        if (assignment.deadline < today)
          await alertRepository.create({
            title: "Assignment overdue",
            message: `${assignment.name} is overdue.`,
            timestamp: now.toISOString(),
            read: false,
            alertType: "assignment",
            referenceType: "assignment",
            referenceId: assignment.id,
            dedupeKey: `assignment-overdue-${assignment.id}-${assignment.deadline}`,
          })
        else if (days <= 1)
          await alertRepository.create({
            title: "Assignment due soon",
            message: `${assignment.name} is due ${
              days <= 0 ? "today" : "tomorrow"
            }.`,
            timestamp: now.toISOString(),
            read: false,
            alertType: "assignment",
            referenceType: "assignment",
            referenceId: assignment.id,
            dedupeKey: `assignment-due-${assignment.id}-${assignment.deadline}`,
          })
      }
    }
    if (state.notificationSettings.competitions) {
      for (const competition of state.competitions.filter(
        (x) => x.status === "upcoming",
      )) {
        const round = competition.rounds
          .filter((x) => x.status === "upcoming")
          .sort((a, b) => a.date.localeCompare(b.date))[0]
        if (round) {
          const days = Math.ceil(
            (new Date(`${round.date}T23:59:59`).getTime() - now.getTime()) /
              DAY,
          )
          if (days >= 0 && days <= 1)
            await alertRepository.create({
              title: "Competition upcoming",
              message: `${competition.name}: ${round.label} is ${
                days === 0 ? "today" : "tomorrow"
              }.`,
              timestamp: now.toISOString(),
              read: false,
              alertType: "competition",
              referenceType: "competition",
              referenceId: competition.id,
              dedupeKey: `competition-${competition.id}-${round.id}`,
            })
        }
      }
    }
  },
}
