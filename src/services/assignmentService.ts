import type { Assignment } from "../types"
import { assignmentRepository } from "../repositories/assignmentRepository"
import { localFileService } from "./fileService"
import { isValidLocalDate, localToday, requireText } from "./validation"
import { getDatabase } from "../database/database"

export function getAssignmentStatus(
  assignment: Assignment,
  today = localToday(),
): Assignment["status"] {
  if (assignment.status === "completed" || assignment.completedAt)
    return "completed"
  return assignment.deadline < today ? "overdue" : "pending"
}
export const assignmentService = {
  async getAll(): Promise<Assignment[]> {
    const rows = await assignmentRepository.getAll()
    return rows.map((a) => ({ ...a, status: getAssignmentStatus(a) }))
  },
  async save(value: Assignment): Promise<Assignment> {
    requireText(value.name, "Assignment name")
    if (!value.subjectId) throw new Error("Choose a subject")
    if (!isValidLocalDate(value.deadline))
      throw new Error("Choose a valid deadline")
    return assignmentRepository.save({
      ...value,
      status: getAssignmentStatus(value),
    })
  },
  async update(id: string, changes: Partial<Assignment>): Promise<Assignment> {
    const current = await assignmentRepository.getById(id)
    if (!current) throw new Error("Assignment not found")
    return this.save({
      ...current,
      ...changes,
      status: getAssignmentStatus({ ...current, ...changes }),
    })
  },
  async delete(id: string): Promise<void> {
    const files = await assignmentRepository.delete(id)
    await Promise.all(
      files.map((f) =>
        f.localPath ? localFileService.delete(f.localPath) : Promise.resolve(),
      ),
    )
  },
  async deleteAll(): Promise<void> {
    const assignments = await assignmentRepository.getAll()
    const files = assignments.flatMap((assignment) => assignment.files)
    const db = await getDatabase()
    await db.run("DELETE FROM assignments")
    await Promise.all(files.map((file) => file.localPath ? localFileService.delete(file.localPath) : Promise.resolve()))
  },
  async deleteFiles(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)]
    const files = await Promise.all(uniqueIds.map(id => assignmentRepository.deleteFile(id)))
    await Promise.all(files.map(file => file?.localPath ? localFileService.delete(file.localPath) : Promise.resolve()))
  },
  async renameFile(id: string, name: string): Promise<void> {
    const cleaned = name.trim()
    if (!cleaned || cleaned.length > 120 || /[\\/\u0000-\u001f]/.test(cleaned)) throw new Error("Choose a valid file name")
    await assignmentRepository.renameFile(id, cleaned)
  },
}
