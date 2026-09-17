import type { Subject, TimetableSlot } from '../types'

export interface OcrBox {
  text: string
  left: number
  top: number
  right: number
  bottom: number
}

export interface TimetableOcrResult {
  width: number
  height: number
  fullText: string
  lines: OcrBox[]
  elements: OcrBox[]
  sourceType?: 'image' | 'pdf'
  pageCount?: number
  pageIndex?: number
  previewDataUrl?: string
  extractionMode?: 'embeddedText' | 'originalImage' | 'enhancedImage' | 'deblurredImage' | 'binaryImage' | 'mergedImage'
}

export interface TimetableImageImport {
  subjects: Subject[]
  timetable: TimetableSlot[]
  detectedDays: string[]
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  labGroups: TimetableLabGroupChoice[]
}

export interface TimetableLabOption {
  subjectId: string
  name: string
  room?: string
  teacher?: string
}

export interface TimetableLabGroupChoice {
  dayOfWeek: number
  period: number
  startTime: string
  endTime: string
  options: TimetableLabOption[]
}

const DAYS = [
  { number: 1, label: 'Monday', aliases: ['monday', 'mon'] },
  { number: 2, label: 'Tuesday', aliases: ['tuesday', 'tue', 'tues'] },
  { number: 3, label: 'Wednesday', aliases: ['wednesday', 'wed', 'weds'] },
  { number: 4, label: 'Thursday', aliases: ['thursday', 'thu', 'thur', 'thurs'] },
  { number: 5, label: 'Friday', aliases: ['friday', 'fri'] },
  { number: 6, label: 'Saturday', aliases: ['saturday', 'sat'] },
  { number: 7, label: 'Sunday', aliases: ['sunday', 'sun'] },
]

const COLORS = ['#8B5CF6', '#F97316', '#3B82F6', '#10B981', '#EC4899', '#F59E0B', '#EF4444', '#14B8A6']
const BREAK_WORDS = /^(?:break|lunch(?:\s+break)?|recess|free)$/i
const HEADER_WORDS = /^(day|days|time|timing|period|periods|lecture|lectures|slot|slots|class|classes)$/i
const TIME_TEXT = /^(?:\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)|p(?:eriod)?\s*\d+)$/i

function clean(value: string) {
  return value.replace(/[|()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim()
}

function editDistance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0]
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex]
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return row[right.length]
}

function normalizeBlurredText(value: string) {
  return value.toLowerCase().replace(/0/g, 'o').replace(/[1|]/g, 'i').replace(/5/g, 's').replace(/8/g, 'b').replace(/[^a-z]/g, '')
}

function findDay(value: string) {
  const normalized = normalizeBlurredText(clean(value))
  return DAYS.find(day => day.aliases.some(alias =>
    normalized === alias || (alias.length >= 5 && normalized === alias.slice(1)) ||
    (normalized.length >= alias.length - 1 && normalized.length <= alias.length + 1 && editDistance(normalized, alias) <= 1),
  ))
}

function centerX(box: OcrBox) { return (box.left + box.right) / 2 }
function centerY(box: OcrBox) { return (box.top + box.bottom) / 2 }

function isNoise(value: string) {
  const text = clean(value)
  return !text || !!findDay(text) || HEADER_WORDS.test(text) || TIME_TEXT.test(text) || /^\d+$/.test(text)
}

function isRoomMetadata(value: string) {
  return /^(?:room\s*)?(?:\d{2,4}|(?:nf|nfc)\s*\d+)$/i.test(clean(value))
}

interface Cell extends OcrBox {
  period: number
  room?: string
  teacher?: string
  spansNextPeriod?: boolean
  alternatives?: { name: string; room?: string; teacher?: string }[]
}

function groupCells(elements: OcrBox[], imageWidth: number): Cell[] {
  const ordered = [...elements].sort((a, b) => a.left - b.left)
  if (!ordered.length) return []

  const heights = ordered.map(box => Math.max(1, box.bottom - box.top)).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] || 12
  const cellGap = Math.max(imageWidth * 0.025, medianHeight * 0.9)
  const groups: OcrBox[][] = []

  for (const element of ordered) {
    const current = groups.at(-1)
    const previous = current?.at(-1)
    if (!current || !previous || element.left - previous.right > cellGap) groups.push([element])
    else current.push(element)
  }

  return groups.map((group, index) => ({
    text: clean(group.map(item => item.text).join(' ')),
    left: Math.min(...group.map(item => item.left)),
    top: Math.min(...group.map(item => item.top)),
    right: Math.max(...group.map(item => item.right)),
    bottom: Math.max(...group.map(item => item.bottom)),
    period: index + 1,
  }))
}

function titleCase(value: string) {
  const titled = clean(value)
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
  return titled
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bFor\b/g, 'for')
    .replace(/\bNcc\/Nss\/Sports\b/g, 'NCC/NSS/Sports')
}

function shortName(value: string) {
  const words = clean(value).replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(Boolean)
  const joined = words.join('')
  if (joined.length <= 6) return joined.toUpperCase()
  if (words.length > 1) return words.map(word => word[0]).join('').slice(0, 6).toUpperCase()
  return joined.slice(0, 6).toUpperCase()
}

function defaultTime(period: number) {
  const startHour = 8 + period
  return {
    startTime: `${String(startHour).padStart(2, '0')}:00`,
    endTime: `${String(startHour + 1).padStart(2, '0')}:00`,
  }
}

function normalizeClock(hourText: string, minuteText = '00', meridiem = '') {
  let hour = Number(hourText)
  const minute = Math.min(59, Number(minuteText || '00'))
  if (meridiem.toLowerCase() === 'pm' && hour < 12) hour += 12
  if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0
  if (hour > 23) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function clockValues(value: string) {
  const values: string[] = []
  value = value.replace(/[bB](?=[.:]\d)/g, '8').replace(/[oO]/g, '0').replace(/[Il|]/g, '1')
  const pattern = /(\d{1,2})(?:[:.](\d{2}))\s*(am|pm)?/gi
  for (const match of value.matchAll(pattern)) {
    const normalized = normalizeClock(match[1], match[2], match[3])
    if (normalized) values.push(normalized)
  }
  return values
}

function oneHourAfter(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return `${String((hour + 1) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function makeClockChronological(value: string, previous?: string) {
  if (!previous) return value
  let [hour, minute] = value.split(':').map(Number)
  const previousMinutes = Number(previous.slice(0, 2)) * 60 + Number(previous.slice(3))
  while (hour < 12 && hour * 60 + minute <= previousMinutes) hour += 12
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function extractPeriodTimes(scan: TimetableOcrResult, daysAreRows: boolean, markers: { box: OcrBox }[], anchors: number[]) {
  const firstMarkerPosition = Math.min(...markers.map(marker => daysAreRows ? centerY(marker.box) : centerX(marker.box)))
  const isHeaderSide = (box: OcrBox) => daysAreRows
    ? centerY(box) < firstMarkerPosition
    : centerX(box) < firstMarkerPosition

  // Embedded PDFs often expose the entire time-header row as one OCR box.
  // Split a box containing several time ranges into positioned virtual boxes
  // so the first time is not accidentally assigned to a middle period.
  const expandTimeBoxes = (boxes: OcrBox[]) => boxes.flatMap(box => {
    const clocks = clockValues(box.text)
    if (clocks.length <= 2) return [box]
    const rangeCount = Math.ceil(clocks.length / 2)
    let inferredPositions: number[] | undefined
    if (anchors.length >= 2 && rangeCount >= anchors.length && rangeCount <= anchors.length + 3) {
      inferredPositions = [...anchors]
      while (inferredPositions.length < rangeCount) {
        let largestGapIndex = 0
        for (let index = 1; index < inferredPositions.length - 1; index += 1) {
          if (inferredPositions[index + 1] - inferredPositions[index] > inferredPositions[largestGapIndex + 1] - inferredPositions[largestGapIndex]) largestGapIndex = index
        }
        inferredPositions.splice(largestGapIndex + 1, 0, (inferredPositions[largestGapIndex] + inferredPositions[largestGapIndex + 1]) / 2)
      }
    }
    return Array.from({ length: rangeCount }, (_, index) => {
      const inferredPosition = inferredPositions?.[index]
      if (inferredPosition !== undefined) return daysAreRows ? {
        ...box,
        text: `${clocks[index * 2]}-${clocks[index * 2 + 1] || ''}`,
        left: inferredPosition - 1,
        right: inferredPosition + 1,
      } : {
        ...box,
        text: `${clocks[index * 2]}-${clocks[index * 2 + 1] || ''}`,
        top: inferredPosition - 1,
        bottom: inferredPosition + 1,
      }
      const fractionStart = index / rangeCount
      const fractionEnd = (index + 1) / rangeCount
      return daysAreRows ? {
        ...box,
        text: `${clocks[index * 2]}-${clocks[index * 2 + 1] || ''}`,
        left: box.left + (box.right - box.left) * fractionStart,
        right: box.left + (box.right - box.left) * fractionEnd,
      } : {
        ...box,
        text: `${clocks[index * 2]}-${clocks[index * 2 + 1] || ''}`,
        top: box.top + (box.bottom - box.top) * fractionStart,
        bottom: box.top + (box.bottom - box.top) * fractionEnd,
      }
    })
  })
  const lineCandidates = expandTimeBoxes(scan.lines.filter(box => isHeaderSide(box) && clockValues(box.text).length > 0))
  const elementCandidates = expandTimeBoxes(scan.elements.filter(box => isHeaderSide(box) && clockValues(box.text).length > 0))
  let candidates = elementCandidates.length >= lineCandidates.length ? elementCandidates : lineCandidates
  candidates.sort((a, b) => daysAreRows ? centerX(a) - centerX(b) : centerY(a) - centerY(b))

  const deduplicated = candidates.filter((box, index, all) => {
    if (index === 0) return true
    const previous = all[index - 1]
    const distance = daysAreRows ? Math.abs(centerX(box) - centerX(previous)) : Math.abs(centerY(box) - centerY(previous))
    return distance > (daysAreRows ? scan.width : scan.height) * 0.015
  })

  let previousStart: string | undefined
  const detected = deduplicated.map((box, index) => {
    const clocks = clockValues(box.text)
    const rawStart = clocks[0]
    if (!rawStart) return null
    const startTime = makeClockChronological(rawStart, previousStart)
    previousStart = startTime
    const rawEnd = clocks[1] || clockValues(deduplicated[index + 1]?.text || '')[0]
    const endTime = rawEnd ? makeClockChronological(rawEnd, startTime) : oneHourAfter(startTime)
    return { box, startTime, endTime }
  }).filter((value): value is { box: OcrBox; startTime: string; endTime: string } => !!value)

  if (anchors.length < 2) return detected.map(({ startTime, endTime }) => ({ startTime, endTime }))
  const times: ({ startTime: string; endTime: string } | undefined)[] = anchors.map(() => undefined)
  const neighbourGaps = anchors.slice(1).map((anchor, index) => anchor - anchors[index]).sort((a, b) => a - b)
  const typicalGap = neighbourGaps[Math.floor(neighbourGaps.length / 2)] || (daysAreRows ? scan.width : scan.height) / Math.max(anchors.length, 1)
  for (const value of detected) {
    const position = daysAreRows ? centerX(value.box) : centerY(value.box)
    let closest = 0
    for (let index = 1; index < anchors.length; index += 1) {
      if (Math.abs(position - anchors[index]) < Math.abs(position - anchors[closest])) closest = index
    }
    // A lunch interval can sit exactly between two numbered period columns.
    // Requiring a close match to the actual header anchor prevents it from
    // overwriting the start/end time of either neighbouring class.
    if (Math.abs(position - anchors[closest]) < typicalGap * 0.42) {
      times[closest] = { startTime: value.startTime, endTime: value.endTime }
    }
  }
  return times
}

function extractPeriodAnchors(scan: TimetableOcrResult, daysAreRows: boolean, markers: { box: OcrBox }[]) {
  const firstMarkerPosition = Math.min(...markers.map(marker => daysAreRows ? centerY(marker.box) : centerX(marker.box)))
  const isHeaderSide = (box: OcrBox) => daysAreRows
    ? centerY(box) < firstMarkerPosition
    : centerX(box) < firstMarkerPosition
  const periodNumber = (value: string) => clean(value).replace(/[Il|]/g, '1').replace(/[oO]/g, '0')
  const numericHeaders = scan.elements
    .filter(box => isHeaderSide(box) && /^\s*(?:[1-9]|1[0-2])\s*$/.test(periodNumber(box.text)))
    .sort((a, b) => daysAreRows ? centerX(a) - centerX(b) : centerY(a) - centerY(b))
  if (numericHeaders.length >= 2) {
    const ordered = numericHeaders.filter((box, index, all) => index === 0 || Number(periodNumber(box.text)) > Number(periodNumber(all[index - 1].text)))
    if (ordered.length >= 2) return ordered.map(box => daysAreRows ? centerX(box) : centerY(box))
  }

  const looksLikePeriodHeader = (box: OcrBox) =>
    /\b(period|lecture|slot)\s*\d+\b|^\s*p\s*\d+\s*$/i.test(clean(box.text)) || clockValues(box.text).length > 0

  let candidates = scan.lines.filter(box => isHeaderSide(box) && looksLikePeriodHeader(box))
  if (candidates.length < 2) candidates = scan.elements.filter(box => isHeaderSide(box) && looksLikePeriodHeader(box))
  const positions = candidates
    .map(box => daysAreRows ? centerX(box) : centerY(box))
    .sort((a, b) => a - b)
  const dimension = daysAreRows ? scan.width : scan.height
  return positions.filter((position, index, all) => index === 0 || position - all[index - 1] > dimension * 0.025)
}

function parseCellEntry(textLines: string[]) {
  const text = clean(textLines.join(' '))
  if (!text) return null
  const teacherPattern = /\b(?:dr|mr|ms|mrs|prof)\.?\s+[a-z][a-z .'-]*/i
  const teacherMatch = text.match(teacherPattern)
  const teacher = clean(teacherMatch?.[0] || '')
  let remaining = teacherMatch ? clean(`${text.slice(0, teacherMatch.index)} ${text.slice((teacherMatch.index || 0) + teacherMatch[0].length)}`) : text
  const roomMatches = [...remaining.matchAll(/(?:^|\s)((?:\d{2,4}|(?:nf|nfc)\s*\d+))(?=\s|$)/gi)]
  const roomMatch = roomMatches.at(-1)
  const room = roomMatch?.[1]?.replace(/\s+/g, '').toUpperCase()
  if (roomMatch?.index !== undefined) {
    const start = roomMatch.index + (roomMatch[0].length - roomMatch[1].length)
    remaining = clean(`${remaining.slice(0, start)} ${remaining.slice(start + roomMatch[1].length)}`)
  }
  return { name: remaining, room, teacher: teacher || undefined }
}

function groupCellsByAnchors(
  elements: OcrBox[],
  anchors: number[],
  daysAreRows: boolean,
  dayStart: number,
  dayEnd: number,
): Cell[] {
  const groups = anchors.map(() => [] as OcrBox[])
  for (const element of elements) {
    const position = daysAreRows ? centerX(element) : centerY(element)
    let closest = 0
    for (let index = 1; index < anchors.length; index += 1) {
      if (Math.abs(position - anchors[index]) < Math.abs(position - anchors[closest])) closest = index
    }
    // Merged two-period cells are centred on the boundary between header
    // anchors. Associate boundary-centred fragments with the starting period.
    for (let index = 0; index < anchors.length - 1; index += 1) {
      const gap = anchors[index + 1] - anchors[index]
      const midpoint = (anchors[index] + anchors[index + 1]) / 2
      if (Math.abs(position - midpoint) <= gap * 0.12) {
        closest = index
        break
      }
    }
    groups[closest].push(element)
  }

  return groups.flatMap((group, index) => {
    if (!group.length) return []
    const heights = group.map(item => Math.max(1, item.bottom - item.top)).sort((a, b) => a - b)
    const lineTolerance = (heights[Math.floor(heights.length / 2)] || 12) * 0.65
    const visualLines: OcrBox[][] = []
    for (const item of [...group].sort((a, b) => daysAreRows ? centerY(a) - centerY(b) : centerX(a) - centerX(b))) {
      const line = visualLines.find(candidate => Math.abs((daysAreRows ? centerY(candidate[0]) : centerX(candidate[0])) - (daysAreRows ? centerY(item) : centerX(item))) <= lineTolerance)
      if (line) line.push(item)
      else visualLines.push([item])
    }
    const subrowSize = Math.max(1, (dayEnd - dayStart) / 3)
    const subrows = [0, 1, 2].map(subrow => visualLines.filter(line => {
      const position = daysAreRows ? centerY(line[0]) : centerX(line[0])
      return Math.max(0, Math.min(2, Math.floor((position - dayStart) / subrowSize))) === subrow
    }))
    const entries = subrows.map(lines => parseCellEntry(lines.map(line => clean([...line]
      .sort((a, b) => daysAreRows ? a.left - b.left : a.top - b.top)
      .map(item => item.text).join(' '))))).filter((entry): entry is NonNullable<typeof entry> => !!entry)
    const labEntries = entries.filter(entry => entry.name && /\blab\b/i.test(entry.name))
    const alternatives = labEntries.length >= 2
      ? labEntries.slice(0, 3).map(({ name, room, teacher }) => ({ name, room, teacher }))
      : undefined
    const primary = entries.find(entry => entry.name)
    if (!primary) return []
    const metadata = entries.reduce((result, entry) => ({
      room: result.room || entry.room,
      teacher: result.teacher || entry.teacher,
    }), { room: undefined as string | undefined, teacher: undefined as string | undefined })
    const groupPosition = daysAreRows
      ? (Math.min(...group.map(item => item.left)) + Math.max(...group.map(item => item.right))) / 2
      : (Math.min(...group.map(item => item.top)) + Math.max(...group.map(item => item.bottom))) / 2
    const spansNextPeriod = !!alternatives && index < anchors.length - 1
      && Math.abs(groupPosition - (anchors[index] + anchors[index + 1]) / 2) <= (anchors[index + 1] - anchors[index]) * 0.2
    return [{
      text: primary.name,
      room: metadata.room,
      teacher: metadata.teacher,
      spansNextPeriod,
      alternatives,
      left: Math.min(...group.map(item => item.left)),
      top: Math.min(...group.map(item => item.top)),
      right: Math.max(...group.map(item => item.right)),
      bottom: Math.max(...group.map(item => item.bottom)),
      period: index + 1,
    }]
  })
}

export function parseTimetableOcr(
  scan: TimetableOcrResult,
  makeId: () => string = () => crypto.randomUUID(),
): TimetableImageImport {
  if (!scan.width || !scan.height || !Array.isArray(scan.elements)) {
    throw new Error('The scanner returned an invalid image result.')
  }

  let markers = scan.elements
    .map(box => ({ box, day: findDay(box.text) }))
    .filter((item): item is { box: OcrBox; day: (typeof DAYS)[number] } => !!item.day)

  // Some timetable images join a weekday with other text into one OCR line.
  if (new Set(markers.map(item => item.day.number)).size < 2) {
    markers = scan.lines.flatMap(line => {
      const day = DAYS.find(candidate => candidate.aliases.some(alias =>
        new RegExp(`(^|\\s)${alias}(?=\\s|$)`, 'i').test(clean(line.text)),
      ))
      return day ? [{ box: line, day }] : []
    })
  }

  markers = markers.filter((marker, index, all) =>
    all.findIndex(other => other.day.number === marker.day.number) === index,
  )

  if (markers.length < 2) {
    throw new Error('I could not find at least two weekday labels. Use a clear, straight image that includes the day names.')
  }

  const xSpread = Math.max(...markers.map(item => centerX(item.box))) - Math.min(...markers.map(item => centerX(item.box)))
  const ySpread = Math.max(...markers.map(item => centerY(item.box))) - Math.min(...markers.map(item => centerY(item.box)))
  const daysAreRows = ySpread >= xSpread
  const periodAnchors = extractPeriodAnchors(scan, daysAreRows, markers)
  const periodTimes = extractPeriodTimes(scan, daysAreRows, markers, periodAnchors)
  const preliminaryMarkerPositions = markers
    .map(marker => daysAreRows ? centerY(marker.box) : centerX(marker.box))
    .sort((a, b) => a - b)
  const preliminaryGaps = preliminaryMarkerPositions.slice(1)
    .map((position, index) => position - preliminaryMarkerPositions[index])
    .sort((a, b) => a - b)
  const preliminaryDayGap = preliminaryGaps[Math.floor(preliminaryGaps.length / 2)]
    || (daysAreRows ? scan.height : scan.width) / Math.max(1, markers.length)
  const bodyStart = preliminaryMarkerPositions[0] - preliminaryDayGap / 2
  const anchorGaps = periodAnchors.slice(1).map((anchor, index) => anchor - periodAnchors[index]).sort((a, b) => a - b)
  const typicalAnchorGap = anchorGaps[Math.floor(anchorGaps.length / 2)] || (daysAreRows ? scan.width : scan.height) / 8
  const bodyLines = scan.lines.filter(line => {
    const span = daysAreRows ? line.right - line.left : line.bottom - line.top
    const containsDay = !!findDay(line.text) || DAYS.some(day => day.aliases.some(alias => new RegExp(`(^|\\s)${alias}(?=\\s|$)`, 'i').test(clean(line.text))))
    // A PDF baseline can contain the weekday and valid cells from the same
    // row. Keep a wide baseline so it can be split into cell fragments below.
    if (span <= typicalAnchorGap * 1.45 && ((isNoise(line.text) && !isRoomMetadata(line.text)) || containsDay)) return false
    return (daysAreRows ? centerY(line) : centerX(line)) >= bodyStart - (daysAreRows ? scan.height : scan.width) * 0.01
  })
  // ML Kit's whole-line boxes are substantially more reliable for dense
  // table cells: a long subject may visually span the column, while its
  // centre still identifies the correct cell. Simple scans keep word boxes.
  const bodyBoxes = bodyLines.flatMap(line => {
    const span = daysAreRows ? line.right - line.left : line.bottom - line.top
    if (span <= typicalAnchorGap * 1.45) return [line]
    // PDF extraction and ML Kit can report a whole visual row as one line.
    // Rebuild adjacent words into cell-sized fragments before assigning a
    // column; assigning every word independently splits long subject names.
    const pieces = scan.elements.filter(element => {
      const sameBand = daysAreRows
        ? centerY(element) >= line.top && centerY(element) <= line.bottom
        : centerX(element) >= line.left && centerX(element) <= line.right
      return sameBand && (!isNoise(element.text) || isRoomMetadata(element.text))
    }).sort((a, b) => daysAreRows ? a.left - b.left : a.top - b.top)
    if (!pieces.length) return []
    const sizes = pieces.map(piece => daysAreRows ? piece.bottom - piece.top : piece.right - piece.left).sort((a, b) => a - b)
    const joinGap = Math.max(
      (daysAreRows ? scan.width : scan.height) * 0.006,
      (sizes[Math.floor(sizes.length / 2)] || 1) * 0.75,
    )
    const fragments: OcrBox[][] = []
    for (const piece of pieces) {
      const fragment = fragments.at(-1)
      const previous = fragment?.at(-1)
      const gap = !previous ? Number.POSITIVE_INFINITY : daysAreRows
        ? piece.left - previous.right
        : piece.top - previous.bottom
      if (!fragment || gap > joinGap) fragments.push([piece])
      else fragment.push(piece)
    }
    return fragments.map(fragment => ({
      text: clean(fragment.map(piece => piece.text).join(' ')),
      left: Math.min(...fragment.map(piece => piece.left)),
      top: Math.min(...fragment.map(piece => piece.top)),
      right: Math.max(...fragment.map(piece => piece.right)),
      bottom: Math.max(...fragment.map(piece => piece.bottom)),
    }))
  })
  const usableElements = bodyLines.length >= markers.length * 2
    ? bodyBoxes
    : scan.elements.filter(element => !isNoise(element.text) || isRoomMetadata(element.text))
  const rows: { day: (typeof DAYS)[number]; cells: Cell[] }[] = []
  const markerPositions = markers
    .map(item => daysAreRows ? centerY(item.box) : centerX(item.box))
    .sort((a, b) => a - b)
  const markerGaps = markerPositions.slice(1).map((position, index) => position - markerPositions[index]).sort((a, b) => a - b)
  const typicalDayGap = markerGaps[Math.floor(markerGaps.length / 2)] || (daysAreRows ? scan.height / 5 : scan.width / 5)

  const physicalMarkers = [...markers].sort((a, b) =>
    (daysAreRows ? centerY(a.box) : centerX(a.box)) - (daysAreRows ? centerY(b.box) : centerX(b.box)),
  )
  const dayBounds = new Map<number, { start: number; end: number }>()
  physicalMarkers.forEach((marker, index) => {
    const position = daysAreRows ? centerY(marker.box) : centerX(marker.box)
    const previousPosition = index > 0
      ? (daysAreRows ? centerY(physicalMarkers[index - 1].box) : centerX(physicalMarkers[index - 1].box))
      : position - typicalDayGap
    const nextPosition = index < physicalMarkers.length - 1
      ? (daysAreRows ? centerY(physicalMarkers[index + 1].box) : centerX(physicalMarkers[index + 1].box))
      : position + typicalDayGap
    dayBounds.set(marker.day.number, { start: (previousPosition + position) / 2, end: (position + nextPosition) / 2 })
  })

  for (const marker of markers.sort((a, b) => a.day.number - b.day.number)) {
    const candidates = usableElements.filter(element => {
      const nearest = markers.reduce((best, current) => {
        const currentDistance = daysAreRows
          ? Math.abs(centerY(element) - centerY(current.box))
          : Math.abs(centerX(element) - centerX(current.box))
        return currentDistance < best.distance ? { marker: current, distance: currentDistance } : best
      }, { marker: markers[0], distance: Number.POSITIVE_INFINITY })

      if (nearest.marker.day.number !== marker.day.number) return false
      if (nearest.distance > typicalDayGap * 0.48) return false
      return daysAreRows
        ? centerX(element) > marker.box.right - scan.width * 0.01
        : centerY(element) > marker.box.bottom - scan.height * 0.01
    })

    const bounds = dayBounds.get(marker.day.number) || {
      start: (daysAreRows ? centerY(marker.box) : centerX(marker.box)) - typicalDayGap / 2,
      end: (daysAreRows ? centerY(marker.box) : centerX(marker.box)) + typicalDayGap / 2,
    }
    const ordered = periodAnchors.length >= 2
      ? groupCellsByAnchors(candidates, periodAnchors, daysAreRows, bounds.start, bounds.end)
      : daysAreRows
      ? groupCells(candidates, scan.width)
      : groupCells(candidates.map(item => ({
          ...item,
          left: item.top,
          right: item.bottom,
          top: item.left,
          bottom: item.right,
        })), scan.height)

    rows.push({ day: marker.day, cells: ordered })
  }

  const subjectByKey = new Map<string, Subject>()
  const timetable: TimetableSlot[] = []
  const labGroups: TimetableLabGroupChoice[] = []

  const getSubject = (rawName: string) => {
    const name = titleCase(rawName)
    const key = name.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/rn/g, 'm').replace(/[^a-z0-9]/g, '')
    if (!key) return null
    let subject = subjectByKey.get(key)
    if (!subject && key.length >= 7) {
      const closeKey = [...subjectByKey.keys()].find(existing =>
        Math.abs(existing.length - key.length) <= 1 && editDistance(existing, key) <= Math.max(1, Math.floor(key.length * 0.12)),
      )
      if (closeKey) subject = subjectByKey.get(closeKey)
    }
    if (!subject) {
      subject = { id: makeId(), name, shortName: shortName(name), color: COLORS[subjectByKey.size % COLORS.length] }
      subjectByKey.set(key, subject)
    }
    return subject
  }

  for (const row of rows) {
    row.cells.forEach(cell => {
      const name = titleCase(cell.text)
      if (!name || BREAK_WORDS.test(name) || isNoise(name)) return
      const period = cell.period
      const time = periodTimes[period - 1] || defaultTime(period)
      if (cell.alternatives?.length) {
        const options = cell.alternatives.flatMap(option => {
          const subject = getSubject(option.name)
          return subject ? [{ subjectId: subject.id, name: subject.name, room: option.room, teacher: option.teacher }] : []
        })
        if (options.length >= 2) {
          const labTime = cell.spansNextPeriod
            ? { startTime: time.startTime, endTime: (periodTimes[period] || defaultTime(period + 1)).endTime }
            : time
          labGroups.push({ dayOfWeek: row.day.number, period, ...labTime, options })
          return
        }
      }
      const subject = getSubject(name)
      if (!subject) return
      timetable.push({
        id: makeId(),
        dayOfWeek: row.day.number,
        period,
        subjectId: subject.id,
        ...time,
        room: cell.room,
        teacher: cell.teacher,
      })
    })
  }

  if (timetable.length + labGroups.length < 2 || subjectByKey.size === 0) {
    throw new Error('Text was detected, but a reliable timetable could not be built. Crop the image to the timetable grid and try again.')
  }

  const detectedDays = rows.filter(row => row.cells.length > 0).map(row => row.day.label)
  const warnings: string[] = []
  const expectedDays = markers.some(marker => marker.day.number > 5) ? Math.max(...markers.map(marker => marker.day.number)) : 5
  if (detectedDays.length < expectedDays) warnings.push(`Only ${detectedDays.length} class day${detectedDays.length === 1 ? '' : 's'} were detected. Add any missing day manually before applying.`)
  const periodCount = Math.max(periodAnchors.length, ...rows.flatMap(row => row.cells.map(cell => cell.period)), 0)
  const sparseDays = rows.filter(row => row.cells.length > 0 && periodCount > 0 && row.cells.length < Math.max(1, Math.ceil(periodCount * 0.4)))
  if (sparseDays.length) warnings.push(`Very few periods were read for ${sparseDays.map(row => row.day.label).join(', ')}. Check those days carefully.`)
  if (periodAnchors.length < 2) warnings.push('Period headers were not detected reliably, so period positions were estimated from the timetable layout.')
  if (scan.fullText.length < 30) warnings.push('Only a small amount of text was readable; review every generated period.')
  warnings.push(periodTimes.length
    ? 'Times were read from the image where possible. Review every generated period before applying.'
    : 'Class times were not readable and are estimated as one-hour periods. Review every generated period before applying.')

  return {
    subjects: [...subjectByKey.values()],
    timetable: timetable.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period),
    detectedDays,
    confidence: detectedDays.length >= Math.min(5, expectedDays) && periodAnchors.length >= 2 && timetable.length >= 12
      ? 'high'
      : detectedDays.length >= 3 && timetable.length >= 6 ? 'medium' : 'low',
    warnings,
    labGroups,
  }
}

export function selectTimetableLabGroup(
  imported: TimetableImageImport,
  group: 1 | 2 | 3,
  makeId: () => string = () => crypto.randomUUID(),
): TimetableImageImport {
  const selectedLabs = imported.labGroups.flatMap(choice => {
    const option = choice.options[group - 1]
    if (!option) return []
    return [{
      id: makeId(),
      dayOfWeek: choice.dayOfWeek,
      period: choice.period,
      subjectId: option.subjectId,
      startTime: choice.startTime,
      endTime: choice.endTime,
      room: option.room,
      teacher: option.teacher,
      labGroup: group,
    } satisfies TimetableSlot]
  })
  const timetable = [...imported.timetable, ...selectedLabs]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period)
  const usedSubjects = new Set(timetable.map(slot => slot.subjectId))
  return { ...imported, timetable, subjects: imported.subjects.filter(subject => usedSubjects.has(subject.id)) }
}
