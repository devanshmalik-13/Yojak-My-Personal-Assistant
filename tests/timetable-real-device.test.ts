import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTimetableOcr, selectTimetableLabGroup, type TimetableOcrResult } from '../src/services/timetableImageParser'

// OCR_FIXTURE lets the connected-device instrumentation output run through
// the exact same reconstruction assertions without replacing the committed
// regression capture.
const fixtureSource = process.env.OCR_FIXTURE || new URL('./fixtures/real-device-timetable-ocr.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureSource, 'utf8')) as TimetableOcrResult

describe('real-device timetable recognition regression', () => {
  it('reconstructs the supplied ten-period grouped timetable', () => {
    let id = 0
    const imported = parseTimetableOcr(fixture, () => `device-${++id}`)
    if (process.env.OCR_DEBUG) {
      const names = new Map(imported.subjects.map(subject => [subject.id, subject.name]))
      console.log(imported.timetable.map(slot => `${slot.dayOfWeek}:P${slot.period}=${names.get(slot.subjectId)}`).join('\n'))
    }
    const groupOne = selectTimetableLabGroup(imported, 1, () => `selected-${++id}`)
    expect(imported.detectedDays).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    expect(imported.confidence).toBe('high')
    expect(imported.groupCount).toBe(3)
    expect(imported.subjects.map(subject => subject.name)).toEqual(expect.arrayContaining([
      'NCC/NSS/Sports', 'Data Structures', 'Computational Methods', 'Discrete Mathematics',
      'Digital Logic and Computer Design', 'Object-Oriented Programming',
      'Object-Oriented Programming Using C++', 'Data Structures Lab',
      'Computational Methods Lab', 'Object-Oriented Programming Using C++ Lab',
      'Digital Logic and Computer Design Lab', 'Library',
    ]))
    expect(imported.subjects.map(subject => subject.name).join(' ')).not.toMatch(/\b(?:Ub|Usiing|Kaus|Juter|Lorn|Ard)\b/i)
    expect(imported.subjects.every(subject => !/^(?:Dr|Mr|Ms|Mrs|Prof)\b/i.test(subject.name))).toBe(true)
    expect(imported.labGroups.map(group => ({ day: group.dayOfWeek, period: group.period, options: group.options.map(option => option?.name || null) }))).toEqual([
      { day: 1, period: 5, options: ['Data Structures Lab', 'Data Structures Lab', 'Computational Methods Lab'] },
      { day: 2, period: 7, options: [null, 'Computational Methods Lab', null] },
      { day: 4, period: 3, options: ['Computational Methods Lab', null, 'Object-Oriented Programming Using C++ Lab'] },
      { day: 4, period: 7, options: ['Object-Oriented Programming Using C++ Lab', 'Object-Oriented Programming Using C++ Lab', 'Data Structures Lab'] },
      { day: 5, period: 7, options: ['Digital Logic and Computer Design Lab', 'Digital Logic and Computer Design Lab', 'Digital Logic and Computer Design Lab'] },
    ])
    expect(groupOne.timetable.find(slot => slot.dayOfWeek === 1 && slot.period === 2)).toMatchObject({ startTime: '09:00', endTime: '09:50' })
    expect(groupOne.timetable.find(slot => slot.dayOfWeek === 5 && slot.period === 7)).toMatchObject({ startTime: '13:40', endTime: '15:20', labGroup: 1 })
    expect(groupOne.timetable.some(slot => slot.dayOfWeek === 2 && slot.period === 7)).toBe(false)
  })
})
