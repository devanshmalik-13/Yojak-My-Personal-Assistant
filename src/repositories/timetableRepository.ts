import { getDatabase } from "../database/database"
import { createId, nowIso } from "../database/ids"
import type { TimetableSlot } from "../types"
import { requireLocalUserId } from "./helpers"
import { localToday } from "../services/validation"

type SlotRow = {
  id: string
  timetable_version_id: string
  day_of_week: number
  period: number
  subject_id: string
  start_time: string
  end_time: string
  room: string | null
  teacher: string | null
  lab_group: 1 | 2 | 3 | null
}
const map = (row: SlotRow): TimetableSlot => ({
  id: row.id,
  timetableVersionId: row.timetable_version_id,
  dayOfWeek: row.day_of_week,
  period: row.period,
  subjectId: row.subject_id,
  startTime: row.start_time,
  endTime: row.end_time,
  room: row.room ?? undefined,
  teacher: row.teacher ?? undefined,
  labGroup: row.lab_group ?? undefined,
})

export const timetableRepository = {
  async getActive(date = localToday()): Promise<{
    versionId?: string
    activeFrom: string
    activeTo: string
    slots: TimetableSlot[]
  }> {
    const database = await getDatabase()
    const version = database.first<{
      id: string
      active_from: string
      active_to: string | null
    }>(
      "SELECT id,active_from,active_to FROM timetable_versions WHERE active_from<=? AND (active_to IS NULL OR active_to>=?) ORDER BY active_from DESC LIMIT 1",
      [date, date],
    )
    if (!version) return { activeFrom: "", activeTo: "", slots: [] }
    const slots = database
      .all<SlotRow>(
        "SELECT * FROM timetable_slots WHERE timetable_version_id=? ORDER BY day_of_week,period",
        [version.id],
      )
      .map(map)
    return {
      versionId: version.id,
      activeFrom: version.active_from,
      activeTo: version.active_to ?? "",
      slots,
    }
  },

  async getVersionForDate(date: string): Promise<string | undefined> {
    const database = await getDatabase()
    return database.first<{ id: string }>(
      "SELECT id FROM timetable_versions WHERE active_from<=? AND (active_to IS NULL OR active_to>=?) ORDER BY active_from DESC LIMIT 1",
      [date, date],
    )?.id
  },

  async createVersion(
    slots: TimetableSlot[],
    activeFrom: string,
  ): Promise<string> {
    const database = await getDatabase()
    const userId = await requireLocalUserId()
    const versionId = createId()
    const timestamp = nowIso()
    await database.run(
      "UPDATE timetable_versions SET active_to=date(?,'-1 day') WHERE user_id=? AND active_to IS NULL",
      [activeFrom, userId],
    )
    await database.run("INSERT INTO timetable_versions VALUES (?,?,?,?,?)", [
      versionId,
      userId,
      activeFrom,
      null,
      timestamp,
    ])
    for (const slot of slots) {
      await database.run(
        `INSERT INTO timetable_slots
          (id,user_id,timetable_version_id,subject_id,day_of_week,period,start_time,end_time,active_from,active_to,created_at,updated_at,room,teacher,lab_group)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          slot.id || createId(),
          userId,
          versionId,
          slot.subjectId,
          slot.dayOfWeek,
          slot.period,
          slot.startTime,
          slot.endTime,
          activeFrom,
          null,
          timestamp,
          timestamp,
          slot.room ?? null,
          slot.teacher ?? null,
          slot.labGroup ?? null,
        ],
      )
    }
    return versionId
  },
}
