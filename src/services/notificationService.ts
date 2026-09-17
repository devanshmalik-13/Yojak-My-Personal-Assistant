import { Capacitor } from "@capacitor/core"
import {
  LocalNotifications,
  type Schedule,
} from "@capacitor/local-notifications"
import { getDatabase } from "../database/database"
import { createId, nowIso } from "../database/ids"
import type { AppState, Reminder } from "../types"
import { requireLocalUserId } from "../repositories/helpers"
import { nextReminderOccurrence } from "./reminderRecurrence"

const browserTimers = new Map<string, number>()
function numericId(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++)
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0
  return Math.abs(hash) || 1
}

async function permissionGranted(request = false): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof Notification === "undefined") return false
    if (Notification.permission === "granted") return true
    return (
      request &&
      Notification.permission !== "denied" &&
      (await Notification.requestPermission()) === "granted"
    )
  }
  const current = await LocalNotifications.checkPermissions()
  if (current.display === "granted") return true
  return (
    request &&
    (await LocalNotifications.requestPermissions()).display === "granted"
  )
}

function nativeSchedule(reminder: Reminder, next: Date): Schedule {
  const [hour, minute] = reminder.time.split(":").map(Number)
  if (reminder.frequency === "once") return { at: next, allowWhileIdle: true }
  if (reminder.frequency === "daily") return { on: { hour, minute } }
  if (reminder.frequency === "weekly")
    return {
      on: {
        weekday: (next.getDay() + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        hour,
        minute,
      },
    }
  if (reminder.frequency === "monthly")
    return { on: { day: next.getDate(), hour, minute } }
  return {
    on: { month: next.getMonth() + 1, day: next.getDate(), hour, minute },
  }
}

export const notificationService = {
  async requestPermission(): Promise<boolean> {
    return permissionGranted(true)
  },
  async cancelForEntity(entityType: string, entityId: string): Promise<void> {
    const db = await getDatabase()
    const row = db.first<{ notification_id: number }>(
      "SELECT notification_id FROM notification_schedules WHERE entity_type=? AND entity_id=?",
      [entityType, entityId],
    )
    if (row && Capacitor.isNativePlatform())
      await LocalNotifications.cancel({
        notifications: [{ id: row.notification_id }],
      }).catch(() => undefined)
    const timer = browserTimers.get(`${entityType}:${entityId}`)
    if (timer !== undefined) window.clearTimeout(timer)
    browserTimers.delete(`${entityType}:${entityId}`)
    await db.run(
      "DELETE FROM notification_schedules WHERE entity_type=? AND entity_id=?",
      [entityType, entityId],
    )
  },
  async scheduleReminder(
    reminder: Reminder,
    requestPermission = true,
  ): Promise<void> {
    await this.cancelForEntity("reminder", reminder.id)
    if (reminder.enabled === false) return
    const next = nextReminderOccurrence(
      reminder.date,
      reminder.time,
      reminder.frequency,
    )
    if (!next || !(await permissionGranted(requestPermission))) return
    const notificationId = numericId(reminder.id)
    if (Capacitor.isNativePlatform())
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId,
            title: "My Personal Assistant",
            body: reminder.message,
            schedule: nativeSchedule(reminder, next),
            extra: { type: "reminder", id: reminder.id },
          },
        ],
      })
    else {
      const delay = next.getTime() - Date.now()
      if (delay > 0 && delay <= 2_147_000_000) {
        const timer = window.setTimeout(
          () =>
            new Notification("My Personal Assistant", {
              body: reminder.message,
            }),
          delay,
        )
        browserTimers.set(`reminder:${reminder.id}`, timer)
      }
    }
    const db = await getDatabase()
    const userId = await requireLocalUserId()
    await db.run("INSERT INTO notification_schedules VALUES (?,?,?,?,?,?,?)", [
      createId(),
      userId,
      "reminder",
      reminder.id,
      notificationId,
      next.toISOString(),
      nowIso(),
    ])
  },
  async scheduleAt(
    entityType: string,
    entityId: string,
    title: string,
    body: string,
    at: Date,
  ): Promise<void> {
    await this.cancelForEntity(entityType, entityId)
    if (at <= new Date() || !(await permissionGranted(false))) return
    const id = numericId(`${entityType}:${entityId}`)
    if (Capacitor.isNativePlatform())
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            schedule: { at, allowWhileIdle: true },
            extra: { type: entityType, id: entityId },
          },
        ],
      })
    else {
      const delay = at.getTime() - Date.now()
      if (delay <= 2_147_000_000)
        browserTimers.set(
          `${entityType}:${entityId}`,
          window.setTimeout(() => new Notification(title, { body }), delay),
        )
    }
    const db = await getDatabase()
    const userId = await requireLocalUserId()
    await db.run("INSERT INTO notification_schedules VALUES (?,?,?,?,?,?,?)", [
      createId(),
      userId,
      entityType,
      entityId,
      id,
      at.toISOString(),
      nowIso(),
    ])
  },
  async reconcileApp(state: AppState): Promise<void> {
    for (const reminder of state.reminders) {
      if (state.notificationSettings.reminders)
        await this.scheduleReminder(reminder, false)
      else await this.cancelForEntity("reminder", reminder.id)
    }
    if (state.notificationSettings.assignments) {
      for (const assignment of state.assignments.filter(
        (x) => x.status !== "completed",
      )) {
        const at = new Date(`${assignment.deadline}T09:00:00`)
        at.setDate(at.getDate() - 1)
        await this.scheduleAt(
          "assignment",
          assignment.id,
          "Assignment due tomorrow",
          assignment.name,
          at,
        )
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
          const at = new Date(`${round.date}T09:00:00`)
          at.setDate(at.getDate() - 1)
          await this.scheduleAt(
            "competition",
            competition.id,
            competition.name,
            `${round.label} is tomorrow`,
            at,
          )
        }
      }
    }
  },
  async cancelAll(): Promise<void> {
    if (Capacitor.isNativePlatform())
      await LocalNotifications.cancel({
        notifications: (
          await LocalNotifications.getPending()
        ).notifications.map((x) => ({ id: x.id })),
      }).catch(() => undefined)
    for (const timer of browserTimers.values()) window.clearTimeout(timer)
    browserTimers.clear()
    const db = await getDatabase()
    await db.run("DELETE FROM notification_schedules")
  },
}
