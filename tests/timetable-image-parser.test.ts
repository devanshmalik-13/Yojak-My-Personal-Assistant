import { describe, expect, it } from 'vitest'
import { parseTimetableOcr, selectTimetableLabGroup, type OcrBox, type TimetableOcrResult } from '../src/services/timetableImageParser'

function box(text: string, left: number, top: number, right: number, bottom: number): OcrBox {
  return { text, left, top, right, bottom }
}

function ids() {
  let value = 0
  return () => `generated-${++value}`
}

describe('timetable image parser', () => {
  it('generates day-wise subjects and periods from weekday rows', () => {
    const elements = [
      box('onday', 20, 100, 100, 125),
      box('Maths', 180, 100, 245, 125),
      box('Data', 350, 100, 395, 125),
      box('Structures', 403, 100, 490, 125),
      box('Lunch Break', 550, 100, 640, 125),
      box('English', 710, 100, 790, 125),
      box('uesday', 20, 180, 100, 205),
      box('English', 180, 180, 260, 205),
      box('Maths', 350, 180, 415, 205),
      box('Physics', 710, 180, 785, 205),
      box('ednesday', 20, 260, 130, 285),
      box('Physics', 180, 260, 255, 285),
      box('English', 350, 260, 430, 285),
      box('Maths', 710, 260, 775, 285),
      box('hursday', 20, 340, 115, 365),
      box('Maths', 180, 340, 245, 365),
      box('Physics', 350, 340, 425, 365),
      box('English', 710, 340, 790, 365),
      box('riday', 20, 420, 90, 445),
      box('Data', 180, 423, 225, 448),
      box('Structures', 233, 419, 320, 444),
      box('Maths', 350, 420, 415, 445),
      box('Physics', 710, 420, 785, 445),
    ]
    const scan: TimetableOcrResult = {
      width: 900,
      height: 600,
      fullText: elements.map(item => item.text).join(' '),
      elements,
      lines: [
        box('09:00 - 10:00', 180, 40, 300, 70),
        box('10:00 - 11:00', 350, 40, 470, 70),
        box('11:00 - 12:00', 560, 40, 680, 70),
        box('12:00 - 13:00', 710, 40, 830, 70),
      ],
    }

    const imported = parseTimetableOcr(scan, ids())

    expect(imported.detectedDays).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    expect(imported.subjects.map(subject => subject.name)).toEqual(
      expect.arrayContaining(['Maths', 'Data Structures', 'English', 'Physics']),
    )
    expect(imported.timetable).toHaveLength(15)
    expect(imported.timetable.filter(slot => slot.dayOfWeek === 1).map(slot => slot.period)).toEqual([1, 2, 4])
    expect(imported.timetable.find(slot => slot.dayOfWeek === 1 && slot.period === 2)).toMatchObject({
      startTime: '10:00', endTime: '11:00',
    })
    expect(imported.confidence).toBe('high')
  })

  it('rejects images without enough weekday structure', () => {
    const scan: TimetableOcrResult = {
      width: 800,
      height: 600,
      fullText: 'Maths Physics English',
      lines: [box('Maths Physics English', 20, 20, 400, 60)],
      elements: [box('Maths', 20, 20, 100, 60), box('Physics', 150, 20, 250, 60)],
    }

    expect(() => parseTimetableOcr(scan, ids())).toThrow(/weekday labels/i)
  })

  it('recovers common blurred weekday, time, period, and subject characters', () => {
    const elements = [
      box('I', 195, 20, 205, 35), box('2', 395, 20, 405, 35),
      box('M0nday', 15, 140, 90, 160), box('Operating Systerns', 150, 140, 285, 160),
      box('Tuesdav', 15, 260, 90, 280), box('Operating Systems', 150, 260, 285, 280),
    ]
    const scan: TimetableOcrResult = {
      width: 600,
      height: 380,
      fullText: elements.map(item => item.text).join(' '),
      elements,
      lines: [
        box('B.10-9.O0', 160, 50, 240, 68),
        box('9.O0-9.50', 360, 50, 440, 68),
        ...elements.slice(2),
      ],
      extractionMode: 'enhancedImage',
    }

    const imported = parseTimetableOcr(scan, ids())
    expect(imported.detectedDays).toEqual(['Monday', 'Tuesday'])
    expect(imported.subjects).toHaveLength(1)
    expect(imported.timetable).toHaveLength(2)
    expect(imported.timetable[0]).toMatchObject({ startTime: '08:10', endTime: '09:00' })
  })

  it('uses numbered columns across lunch and removes room and faculty metadata', () => {
    const elements = [
      box('1', 195, 20, 205, 35), box('2', 295, 20, 305, 35),
      box('3', 495, 20, 505, 35), box('4', 595, 20, 605, 35),
      box('Monday', 15, 150, 90, 170),
      box('Design', 155, 145, 180, 162), box('and', 182, 145, 195, 162),
      box('Analysis', 197, 145, 222, 162), box('of', 224, 145, 232, 162), box('Algorithm', 234, 145, 248, 162),
      box('142', 190, 170, 215, 187), box('Dr Deepak', 175, 195, 245, 212),
      box('Library', 475, 145, 530, 162),
      box('Tuesday', 15, 280, 90, 300),
      box('Software', 160, 275, 190, 292), box('Engineering', 193, 275, 230, 292), box('Lab', 233, 275, 247, 292),
      box('145', 190, 300, 215, 317), box('Ms Ashish Sharma', 165, 325, 275, 342),
      box('Operating', 460, 275, 500, 292), box('Systems', 503, 275, 545, 292),
    ]
    const scan: TimetableOcrResult = {
      width: 800,
      height: 500,
      fullText: elements.map(item => item.text).join(' '),
      elements,
      lines: [
        box('8.10-9.00', 165, 50, 235, 68),
        box('9.00-9.50', 265, 50, 335, 68),
        box('1.10-1.40', 365, 50, 435, 68),
        box('1.40-2.30', 465, 50, 535, 68),
        box('2.30-3.20', 565, 50, 635, 68),
      ],
    }

    const imported = parseTimetableOcr(scan, ids())

    expect(imported.subjects.map(subject => subject.name)).toEqual(expect.arrayContaining([
      'Design and Analysis of Algorithm', 'Library', 'Software Engineering Lab', 'Operating Systems',
    ]))
    expect(imported.subjects.map(subject => subject.name).join(' ')).not.toMatch(/Deepak|Sharma|\b142\b|\b145\b/)
    const lecture = imported.timetable.find(slot => slot.dayOfWeek === 1 && slot.period === 1)
    expect(lecture).toMatchObject({ room: '142', teacher: 'Dr Deepak' })
    expect(imported.timetable.find(slot => slot.dayOfWeek === 1 && slot.period === 3)).toMatchObject({
      startTime: '13:40', endTime: '14:30',
    })
  })

  it('maps a merged PDF time header to numbered periods without treating lunch as a class', () => {
    const periodX = [160, 260, 360, 460, 560, 660, 810, 910, 1010, 1110]
    const elements = [
      ...periodX.map((x, index) => box(String(index + 1), x - 5, 20, x + 5, 35)),
      box('Monday', 15, 150, 90, 170),
      box('EFE', 140, 150, 180, 170),
      box('DAAOA', 540, 150, 585, 170),
      box('CDL', 640, 150, 680, 170),
      box('OS', 790, 150, 830, 170),
      box('Compiler Design', 1070, 150, 1150, 170),
      box('Tuesday', 15, 280, 90, 300),
      box('Networks', 240, 280, 295, 300),
      box('Software Engineering', 890, 280, 960, 300),
    ]
    const mergedTimeHeader = box(
      '8.10-9.00 9.00-9.50 9.50-10.40 10.40-11.30 11.30-12.20 12.20-1.10 1.10-1.40 1.40-2.30 2.30-3.20 3.20-4.10 4.10-5.00',
      120, 50, 1150, 70,
    )
    const scan: TimetableOcrResult = {
      width: 1200,
      height: 420,
      fullText: elements.map(item => item.text).join(' '),
      elements,
      lines: [mergedTimeHeader, ...elements.filter(item => !/^\d+$/.test(item.text))],
      extractionMode: 'positionedPdf',
    }

    const imported = parseTimetableOcr(scan, ids())
    const monday = imported.timetable.filter(slot => slot.dayOfWeek === 1)

    expect(monday.find(slot => slot.period === 1)).toMatchObject({ startTime: '08:10', endTime: '09:00' })
    expect(monday.find(slot => slot.period === 5)).toMatchObject({ startTime: '11:30', endTime: '12:20' })
    expect(monday.find(slot => slot.period === 6)).toMatchObject({ startTime: '12:20', endTime: '13:10' })
    expect(monday.find(slot => slot.period === 7)).toMatchObject({ startTime: '13:40', endTime: '14:30' })
    expect(monday.find(slot => slot.period === 10)).toMatchObject({ startTime: '16:10', endTime: '17:00' })
  })

  it('asks for a lab group and selects only that simultaneous lab division', () => {
    const elements = [
      box('1', 195, 20, 205, 35), box('2', 395, 20, 405, 35),
      box('Monday', 15, 150, 90, 170),
      box('Networks Lab', 150, 125, 245, 143),
      box('Systems Lab', 150, 153, 235, 171),
      box('Compiler Lab', 150, 181, 240, 199),
      box('Tuesday', 15, 280, 90, 300), box('Mathematics', 350, 280, 445, 300),
    ]
    const scan: TimetableOcrResult = {
      width: 600, height: 420, fullText: elements.map(item => item.text).join(' '), elements,
      lines: elements.filter(item => !/^\d$/.test(item.text)),
    }

    const imported = parseTimetableOcr(scan, ids())
    expect(imported.labGroups).toHaveLength(1)
    expect(imported.labGroups[0].options.map(option => option.name)).toEqual([
      'Networks Lab', 'Systems Lab', 'Compiler Lab',
    ])

    const selected = selectTimetableLabGroup(imported, 2, ids())
    const lab = selected.timetable.find(slot => slot.dayOfWeek === 1 && slot.period === 1)
    expect(selected.subjects.map(subject => subject.name)).toContain('Systems Lab')
    expect(selected.subjects.map(subject => subject.name)).not.toContain('Networks Lab')
    expect(lab?.labGroup).toBe(2)
  })

  it('uses the three day subrows as class metadata or simultaneous lab groups', () => {
    const elements = [
      box('1', 195, 20, 205, 35), box('2', 395, 20, 405, 35),
      box('Monday', 15, 140, 90, 160),
      box('Design', 150, 102, 195, 118), box('and', 198, 102, 220, 118),
      box('Analysis', 223, 102, 275, 118), box('of', 190, 119, 205, 123), box('Algorithm', 208, 119, 270, 123),
      box('142', 190, 150, 215, 168), box('Dr', 165, 194, 183, 212), box('Deepak', 186, 194, 235, 212),
      box('Compiler', 350, 102, 405, 118), box('Design', 408, 102, 450, 118), box('Lab', 453, 102, 475, 118),
      box('236', 478, 102, 502, 118), box('Ms', 505, 102, 523, 118), box('Garima', 526, 102, 570, 118),
      box('Operating', 350, 150, 410, 168), box('Systems', 413, 150, 465, 168), box('Lab', 468, 150, 490, 168),
      box('131', 493, 150, 517, 168), box('Dr', 520, 150, 538, 168), box('Moolchand', 541, 150, 605, 168),
      box('Computer', 350, 194, 410, 212), box('Networks', 413, 194, 470, 212), box('Lab', 473, 194, 495, 212),
      box('132', 498, 194, 522, 212), box('Mr.', 525, 194, 545, 212), box('Anupam', 548, 194, 598, 212),
      box('Tuesday', 15, 290, 90, 310), box('Library', 150, 290, 205, 308),
    ]
    const scan: TimetableOcrResult = {
      width: 700, height: 430, fullText: elements.map(item => item.text).join(' '), elements,
      lines: [
        box('Design and Analysis', 150, 102, 275, 118), box('of Algorithm', 190, 119, 270, 123),
        box('Monday 142 Operating Systems Lab 131 Dr Moolchand', 15, 140, 605, 168), box('Dr Deepak', 165, 194, 235, 212),
        box('Compiler Design Lab 236 Ms Garima', 350, 102, 570, 118),
        box('Computer Networks Lab 132 Mr. Anupam', 350, 194, 598, 212),
        box('Library', 150, 290, 205, 308),
      ],
    }

    const imported = parseTimetableOcr(scan, ids())
    expect(imported.subjects.map(subject => subject.name)).toContain('Design and Analysis of Algorithm')
    expect(imported.timetable.find(slot => slot.dayOfWeek === 1 && slot.period === 1)).toMatchObject({
      room: '142', teacher: 'Dr Deepak',
    })
    expect(imported.labGroups[0].options).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Compiler Design Lab', room: '236', teacher: 'Ms Garima' }),
      expect.objectContaining({ name: 'Operating Systems Lab', room: '131', teacher: 'Dr Moolchand' }),
      expect.objectContaining({ name: 'Computer Networks Lab', room: '132', teacher: 'Mr. Anupam' }),
    ]))
    const selected = selectTimetableLabGroup(imported, 2, ids())
    expect(selected.subjects.map(subject => subject.name)).not.toContain('Compiler Design Lab')
    expect(selected.subjects.map(subject => subject.name)).toContain('Operating Systems Lab')
  })

  it('supports weekend classes and flags sparse days for review', () => {
    const elements = [
      box('1', 195, 20, 205, 35), box('2', 395, 20, 405, 35), box('3', 595, 20, 605, 35),
      box('Friday', 15, 120, 90, 140), box('Physics', 160, 120, 225, 140), box('Maths', 360, 120, 420, 140), box('English', 560, 120, 630, 140),
      box('Saturday', 15, 240, 100, 260), box('Robotics Lab', 160, 240, 260, 260),
      box('Sunday', 15, 360, 90, 380), box('Seminar', 360, 360, 425, 380),
    ]
    const scan: TimetableOcrResult = {
      width: 800, height: 480, fullText: elements.map(item => item.text).join(' '), elements,
      lines: elements.filter(item => !/^\d$/.test(item.text)),
    }

    const imported = parseTimetableOcr(scan, ids())

    expect(imported.detectedDays).toEqual(['Friday', 'Saturday', 'Sunday'])
    expect(imported.timetable.find(slot => slot.dayOfWeek === 6)?.subjectId).toBeTruthy()
    expect(imported.timetable.find(slot => slot.dayOfWeek === 7)?.period).toBe(2)
    expect(imported.warnings.join(' ')).toMatch(/few periods.*Saturday/i)
  })
})
