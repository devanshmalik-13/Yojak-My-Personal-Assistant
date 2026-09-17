import { getDatabase } from "../database/database"
import { createId } from "../database/ids"
import type { Subject, TimetableSlot } from "../types"
import { attendanceRepository } from "../repositories/attendanceRepository"
import { subjectRepository } from "../repositories/subjectRepository"
import { timetableRepository } from "../repositories/timetableRepository"
import { isValidTime, localToday, requireText } from "./validation"

export type AttendanceKeepMode = "all" | "before-date" | "fresh"

export function getCurrentTimetableSubjects(subjects: Subject[], slots: TimetableSlot[]): Subject[] {
  const activeSubjectIds = new Set(slots.map((slot) => slot.subjectId))
  return subjects.filter((subject) => activeSubjectIds.has(subject.id))
}

export const timetableService = {
  async replace(input: {
    subjects: Subject[]
    slots: TimetableSlot[]
    keepMode: AttendanceKeepMode
    cutoffDate?: string
    activeFrom?: string
  }): Promise<void> {
    for (const subject of input.subjects) {
      requireText(subject.name, "Subject name")
      requireText(subject.shortName, "Subject short name")
    }
    const names = input.subjects.map((x) => x.name.trim().toLowerCase())
    if (new Set(names).size !== names.length)
      throw new Error("Subject names must be unique")
    const periods = new Set<string>()
    for (const slot of input.slots) {
      const key = `${slot.dayOfWeek}:${slot.period}`
      if (periods.has(key))
        throw new Error("A timetable cannot contain duplicate periods")
      periods.add(key)
      if (
        !isValidTime(slot.startTime) ||
        !isValidTime(slot.endTime) ||
        slot.startTime >= slot.endTime
      )
        throw new Error("Every class must end after it starts")
      if (!input.subjects.some((x) => x.id === slot.subjectId))
        throw new Error("Every timetable period must reference a subject")
    }
    const db = await getDatabase()
    const activeFrom = input.activeFrom ?? localToday()
    await db.transaction(async () => {
      const current = await subjectRepository.getAll()
      const currentIds = new Set(current.map((s) => s.id))
      const idMap = new Map<string, string>()
      for (const subject of input.subjects) {
        if (currentIds.has(subject.id)) {
          await subjectRepository.update(subject.id, subject)
          idMap.set(subject.id, subject.id)
        } else {
          const created = await subjectRepository.create({
            ...subject,
            id: createId(),
          })
          idMap.set(subject.id, created.id)
        }
      }
      const slots = input.slots.map((slot) => ({
        ...slot,
        id: createId(),
        subjectId: idMap.get(slot.subjectId) ?? slot.subjectId,
      }))
      if (input.keepMode === "fresh") await attendanceRepository.deleteAll()
      else if (input.keepMode === "before-date") {
        if (!input.cutoffDate) throw new Error("Choose a cutoff date")
        await attendanceRepository.deleteFrom(input.cutoffDate)
      }
      await timetableRepository.createVersion(slots, activeFrom)
    })
  },
}
