import type { Subject, TimetableSlot } from '../types'
import { constructGridDays } from './timetableGridConstructor'

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
  extractionMode?: 'embeddedText' | 'originalImage' | 'enhancedImage' | 'deblurredImage' | 'binaryImage' | 'mergedImage' | 'regionConsensus'
  gridVerticalLines?: number[]
  gridHorizontalLines?: number[]
  gridCells?: (OcrBox & { lines?: OcrBox[]; hasInk?: boolean })[]
}

export interface TimetableImageImport {
  subjects: Subject[]
  timetable: TimetableSlot[]
  detectedDays: string[]
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  labGroups: TimetableLabGroupChoice[]
  groupCount?: number
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
  options: (TimetableLabOption | null)[]
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
    (alias.length >= 5 && normalized.length >= alias.length - 1 && normalized.length <= alias.length + 1 && editDistance(normalized, alias) <= 1),
  ))
}

function centerX(box: OcrBox) { return (box.left + box.right) / 2 }
function centerY(box: OcrBox) { return (box.top + box.bottom) / 2 }

function headerBodyBoundary(markers: { box: OcrBox }[], daysAreRows: boolean) {
  const positions = markers.map(marker => daysAreRows ? centerY(marker.box) : centerX(marker.box)).sort((a, b) => a - b)
  const gaps = positions.slice(1).map((position, index) => position - positions[index]).filter(gap => gap > 0).sort((a, b) => a - b)
  const typicalDaySize = gaps[Math.floor(gaps.length / 2)] || Math.max(1, positions[0] * 0.6)
  return positions[0] - typicalDaySize * 0.45
}

function isNoise(value: string) {
  const text = clean(value)
  return !text || !!findDay(text) || HEADER_WORDS.test(text) || TIME_TEXT.test(text) || /^\d+$/.test(text)
}

function isRoomMetadata(value: string) {
  return /^(?:room\s*)?(?:\d{2,4}(?:\s*-\s*\d{2,4})?|(?:nf|nfc)\s*\d+)$/i.test(clean(value))
}

export interface Cell extends OcrBox {
  period: number
  room?: string
  teacher?: string
  spansNextPeriod?: boolean
  endPeriod?: number
  alternatives?: ({ name: string; room?: string; teacher?: string } | null)[]
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

const ACADEMIC_TERMS = [
  'object', 'oriented', 'programming', 'computational', 'methods', 'data', 'structures',
  'discrete', 'mathematics', 'digital', 'logic', 'computer', 'design', 'operating',
  'systems', 'software', 'engineering', 'networks', 'compiler', 'algorithm', 'analysis',
  'database', 'electronics', 'communication', 'physics', 'chemistry', 'biology',
  'economics', 'accounting', 'management', 'artificial', 'intelligence', 'machine',
  'learning', 'development', 'architecture', 'security', 'theory', 'applications',
]

export function repairAcademicText(value: string) {
  const normalizedForMatch = (token: string) => token.toLowerCase()
    .replace(/0/g, 'o').replace(/[1|]/g, 'i').replace(/5/g, 's').replace(/rn/g, 'm')
  value = value.replace(/\b(?:ub|ob)\s+ect\b/gi, 'Object')
  // OCR frequently damages both halves of this hyphenated phrase (for
  // example "Ub|ect-Urierited").  Once the first word is recovered, use the
  // strong two-word context to allow one extra edit in "oriented"; applying
  // that tolerance globally would over-correct unrelated course names.
  value = value.replace(/\bobject[\s-]+([a-z0-9|]{6,10})\b/gi, (match, token: string) => {
    const normalized = normalizedForMatch(token)
    return editDistance(normalized, 'oriented') <= 3 ? 'Object-Oriented' : match
  })
  const repaired = value.replace(/[a-zA-Z0-9|]{4,}/g, token => {
    const normalized = normalizedForMatch(token)
    let best = token
    let bestDistance = Number.POSITIVE_INFINITY
    for (const term of ACADEMIC_TERMS) {
      if (Math.abs(term.length - normalized.length) > 1) continue
      const distance = editDistance(normalized, normalizedForMatch(term))
      const allowed = normalized.length >= 6 ? 2 : 1
      if (distance <= allowed && distance < bestDistance) {
        best = term
        bestDistance = distance
      }
    }
    return best
  })
  return repaired
    .replace(/\bobject[\s-]+oriented\b/gi, 'Object-Oriented')
    .replace(/\b(Object-Oriented)(?:\s+\1)+\b/gi, '$1')
}

function titleCase(value: string) {
  const titled = repairAcademicText(clean(value))
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
  const compact = titled.replace(/[^a-z]/gi, '')
  if (/^Ncc[a-z]?Nss[a-z]?Sports$/i.test(compact)
    || (/ncc/i.test(compact) && /sports/i.test(compact))) return 'NCC/NSS/Sports'
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
  value = value
    .replace(/[bB](?=\s*[.:]\s*\d)/g, '8')
    .replace(/[oO]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[–—−~]/g, '-')
  // Read each side of a range independently. OCR commonly drops the first
  // separator only ("900-9.50") or appends a stray character to the second
  // time. Treating the whole string with one regex shifted every later period.
  const rangeParts = value.split('-').map(part => part.trim()).filter(Boolean)
  if (rangeParts.length === 2) {
    const parsePart = (part: string) => {
      const punctuated = part.match(/(\d{1,2})\s*[:.]\s*(\d{2})/)
      if (punctuated) return normalizeClock(punctuated[1], punctuated[2])
      const compact = part.match(/(?:^|\D)(\d{3,4})(?:\D|$)/)
      return compact ? normalizeClock(compact[1].slice(0, -2), compact[1].slice(-2)) : null
    }
    const start = parsePart(rangeParts[0]), end = parsePart(rangeParts[1])
    if (start && end) {
      const duration = durationMinutes(start, end)
      if (duration >= 15 && duration <= 180) return [start, end]
    }
  }
  const pattern = /(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm)?/gi
  for (const match of value.matchAll(pattern)) {
    const normalized = normalizeClock(match[1], match[2], match[3])
    if (normalized) values.push(normalized)
  }
  // Blurred OCR frequently drops the punctuation from a range ("810-900")
  // or separates its digits ("8 10 - 9 00"). Only enable these repairs when
  // a range delimiter is present, so room numbers such as 141 are not clocks.
  if (values.length < 2 && /-/.test(value)) {
    const compact: string[] = []
    const compactPattern = /(?:^|[^\d])(\d{1,2})\s+(\d{2})(?=\D|$)|(?:^|[^\d])(\d{3,4})(?=\D|$)/g
    for (const match of value.matchAll(compactPattern)) {
      const digits = match[3]
      const hour = digits ? digits.slice(0, -2) : match[1]
      const minute = digits ? digits.slice(-2) : match[2]
      const normalized = normalizeClock(hour, minute)
      if (normalized) compact.push(normalized)
    }
    if (compact.length >= 2) {
      const firstDuration = durationMinutes(compact[0], compact[1])
      if (firstDuration >= 15 && firstDuration <= 180) return compact
    }
  }
  return values
}

function clockMinutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

function durationMinutes(start: string, end: string) {
  let duration = clockMinutes(end) - clockMinutes(start)
  while (duration <= 0) duration += 12 * 60
  return duration
}

function addClockMinutes(value: string, amount: number) {
  const total = (clockMinutes(value) + amount + 24 * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function completePeriodTimes(
  source: ({ startTime: string; endTime: string } | undefined)[],
  anchors: number[],
) {
  if (!source.some(Boolean)) return source
  const result = [...source]
  const durations = result.flatMap(time => time ? [durationMinutes(time.startTime, time.endTime)] : [])
    .filter(duration => duration >= 35 && duration <= 100)
    .sort((a, b) => a - b)
  const duration = durations[Math.floor(durations.length / 2)] || 50
  const gaps = anchors.slice(1).map((anchor, index) => anchor - anchors[index]).filter(gap => gap > 0).sort((a, b) => a - b)
  const typicalGap = gaps[Math.floor(gaps.length / 2)] || 1
  const breakAfter = (index: number) => {
    if (index < 0 || index + 1 >= anchors.length) return 0
    const extraRatio = Math.max(0, (anchors[index + 1] - anchors[index]) / typicalGap - 1)
    return Math.round(extraRatio * duration / 5) * 5
  }
  for (let index = 1; index < result.length; index += 1) {
    if (!result[index] && result[index - 1]) {
      const startTime = addClockMinutes(result[index - 1]!.endTime, breakAfter(index - 1))
      result[index] = { startTime, endTime: addClockMinutes(startTime, duration) }
    }
  }
  for (let index = result.length - 2; index >= 0; index -= 1) {
    if (!result[index] && result[index + 1]) {
      const endTime = addClockMinutes(result[index + 1]!.startTime, -breakAfter(index))
      result[index] = { startTime: addClockMinutes(endTime, -duration), endTime }
    }
  }
  return result
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
  const firstMarkerPosition = headerBodyBoundary(markers, daysAreRows)
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

  const dimension = daysAreRows ? scan.width : scan.height
  const anchorGaps = anchors.slice(1).map((anchor, index) => anchor - anchors[index]).sort((a, b) => a - b)
  const typicalGap = anchorGaps[Math.floor(anchorGaps.length / 2)] || dimension / Math.max(anchors.length, 8)
  const deduplicated: OcrBox[] = []
  for (const box of candidates) {
    const position = daysAreRows ? centerX(box) : centerY(box)
    const existingIndex = deduplicated.findIndex(existing => Math.abs(
      position - (daysAreRows ? centerX(existing) : centerY(existing)),
    ) <= typicalGap * 0.24)
    if (existingIndex < 0) deduplicated.push(box)
    else {
      const existing = deduplicated[existingIndex]
      const score = clockValues(box.text).length * 100 + box.text.length
      const existingScore = clockValues(existing.text).length * 100 + existing.text.length
      if (score > existingScore) deduplicated[existingIndex] = box
    }
  }
  deduplicated.sort((a, b) => daysAreRows ? centerX(a) - centerX(b) : centerY(a) - centerY(b))

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

  // Align the ordered ranges to the ordered numbered columns. Dynamic
  // programming permits extra ranges (normally lunch) and missing OCR boxes
  // without shifting every later period or falling back to invented times.
  const candidateCount = detected.length
  const periodCount = anchors.length
  if (candidateCount >= periodCount) {
    const dp = Array.from({ length: periodCount + 1 }, () => Array(candidateCount + 1).fill(Number.POSITIVE_INFINITY))
    const take = Array.from({ length: periodCount + 1 }, () => Array(candidateCount + 1).fill(false))
    for (let candidate = 0; candidate <= candidateCount; candidate += 1) dp[0][candidate] = 0
    for (let period = 1; period <= periodCount; period += 1) {
      for (let candidate = 1; candidate <= candidateCount; candidate += 1) {
        dp[period][candidate] = dp[period][candidate - 1]
        const value = detected[candidate - 1]
        const position = daysAreRows ? centerX(value.box) : centerY(value.box)
        const distanceCost = Math.abs(position - anchors[period - 1]) / Math.max(1, typicalGap)
        const duration = durationMinutes(value.startTime, value.endTime)
        const breakPenalty = duration < 38 ? 1.35 : duration > 100 ? 0.75 : 0
        const matchCost = dp[period - 1][candidate - 1] + distanceCost + breakPenalty
        if (matchCost < dp[period][candidate]) {
          dp[period][candidate] = matchCost
          take[period][candidate] = true
        }
      }
    }
    let period = periodCount, candidate = candidateCount
    while (period > 0 && candidate > 0) {
      if (take[period][candidate]) {
        const value = detected[candidate - 1]
        times[period - 1] = { startTime: value.startTime, endTime: value.endTime }
        period--
      }
      candidate--
    }
  } else {
    for (const value of detected) {
      const position = daysAreRows ? centerX(value.box) : centerY(value.box)
      let closest = 0
      for (let index = 1; index < anchors.length; index += 1) {
        if (Math.abs(position - anchors[index]) < Math.abs(position - anchors[closest])) closest = index
      }
      if (Math.abs(position - anchors[closest]) < typicalGap * 0.7) {
        times[closest] = { startTime: value.startTime, endTime: value.endTime }
      }
    }
  }
  return times
}

function extractPeriodAnchors(scan: TimetableOcrResult, daysAreRows: boolean, markers: { box: OcrBox }[]) {
  const firstMarkerPosition = headerBodyBoundary(markers, daysAreRows)
  const isHeaderSide = (box: OcrBox) => daysAreRows
    ? centerY(box) < firstMarkerPosition
    : centerX(box) < firstMarkerPosition
  const periodNumber = (value: string) => clean(value).replace(/[Il|]/g, '1').replace(/[oO]/g, '0')
  const numericHeaders = scan.elements
    .filter(box => isHeaderSide(box) && /^\s*(?:[1-9]|1[0-2])\s*$/.test(periodNumber(box.text)))
    .sort((a, b) => daysAreRows ? centerX(a) - centerX(b) : centerY(a) - centerY(b))
  if (numericHeaders.length >= 2) {
    const numbered = numericHeaders.map(box => ({
      number: Number(periodNumber(box.text)),
      position: daysAreRows ? centerX(box) : centerY(box),
    })).filter((item, index, all) => all.findIndex(other => other.number === item.number) === index)
      .filter((item, index, all) => index === 0 || item.number > all[index - 1].number)
    const minimum = Math.min(...numbered.map(item => item.number))
    const maximum = Math.max(...numbered.map(item => item.number))
    if (numbered.length >= 2 && minimum <= 2 && maximum >= 3) {
      const known = new Map(numbered.map(item => [item.number, item.position]))
      const pairSteps = numbered.slice(1).map((item, index) =>
        (item.position - numbered[index].position) / Math.max(1, item.number - numbered[index].number),
      ).filter(step => step > 0).sort((a, b) => a - b)
      const typicalStep = pairSteps[Math.floor(pairSteps.length / 2)] || (daysAreRows ? scan.width : scan.height) / maximum
      const reconstructed: number[] = []
      for (let period = 1; period <= maximum; period += 1) {
        const exact = known.get(period)
        if (exact !== undefined) {
          reconstructed.push(exact)
          continue
        }
        const before = [...numbered].reverse().find(item => item.number < period)
        const after = numbered.find(item => item.number > period)
        if (before && after) {
          reconstructed.push(before.position + (after.position - before.position) * (period - before.number) / (after.number - before.number))
        } else if (before) reconstructed.push(before.position + typicalStep * (period - before.number))
        else if (after) reconstructed.push(after.position - typicalStep * (after.number - period))
      }
      return reconstructed
    }
    if (numbered.length >= 2) return numbered.map(item => item.position)
  }

  // Grid geometry is independent of OCR. When period digits are unreadable,
  // use the detected cell columns/rows and remove the weekday-label cell plus
  // narrow break columns. This prevents later subjects from collapsing into
  // fabricated P1/P2/P3 positions.
  const gridLines = [...(daysAreRows ? scan.gridVerticalLines || [] : scan.gridHorizontalLines || [])]
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b)
  if (gridLines.length >= 4) {
    const gridCells = gridLines.slice(1).map((line, index) => ({
      center: (gridLines[index] + line) / 2,
      size: line - gridLines[index],
    })).filter(cell => cell.size > 0)
    const markerPosition = markers.reduce((sum, marker) =>
      sum + (daysAreRows ? centerX(marker.box) : centerY(marker.box)), 0) / markers.length
    let markerCell = 0
    for (let index = 1; index < gridCells.length; index += 1) {
      if (Math.abs(gridCells[index].center - markerPosition) < Math.abs(gridCells[markerCell].center - markerPosition)) markerCell = index
    }
    const bodyCells = gridCells.slice(markerCell + 1)
    const sizes = bodyCells.map(cell => cell.size).sort((a, b) => a - b)
    const medianSize = sizes[Math.floor(sizes.length / 2)] || 0
    const structuralAnchors = bodyCells
      .filter(cell => cell.size >= medianSize * 0.62)
      .map(cell => cell.center)
    if (structuralAnchors.length >= 2) return structuralAnchors
  }

  const looksLikePeriodHeader = (box: OcrBox) =>
    /\b(period|lecture|slot)\s*\d+\b|^\s*p\s*\d+\s*$/i.test(clean(box.text)) || clockValues(box.text).length > 0

  let candidates = scan.lines.filter(box => isHeaderSide(box) && looksLikePeriodHeader(box))
  if (candidates.length < 2) candidates = scan.elements.filter(box => isHeaderSide(box) && looksLikePeriodHeader(box))
  if (candidates.length >= 5) {
    const withoutShortBreaks = candidates.filter(box => {
      const clocks = clockValues(box.text)
      return clocks.length < 2 || durationMinutes(clocks[0], clocks[1]) >= 38
    })
    if (withoutShortBreaks.length >= 2) candidates = withoutShortBreaks
  }
  const positions = candidates
    .map(box => daysAreRows ? centerX(box) : centerY(box))
    .sort((a, b) => a - b)
  const dimension = daysAreRows ? scan.width : scan.height
  return positions.filter((position, index, all) => index === 0 || position - all[index - 1] > dimension * 0.025)
}

export function parseCellEntry(textLines: string[]) {
  const normalizeRoomGlyphs = (value: string) => value.replace(/\b([0-9OQISl|T]{2,4})(\s*[-–]\s*)([0-9OQISl|T]{2,4})\b/gi, (_match, left, dash, right) => {
    const digits = (part: string) => part.replace(/[OQ]/gi, '0').replace(/[ISl|T]/gi, '1')
    return `${digits(left)}${dash}${digits(right)}`
  })
  const lines = textLines.flatMap(line => line.split(/\r?\n/)).map(line => clean(normalizeRoomGlyphs(line))).filter(Boolean)
  let text = clean(normalizeRoomGlyphs(lines.join(' ')))
  if (!text) return null
  const teacherPattern = /\b(?:dr|mr|ms|mrs|prof)\.?\s+[a-z][a-z .'-]*/i
  const teacherMatch = text.match(teacherPattern)
  let teacher = clean(teacherMatch?.[0] || '')
  let remaining = teacherMatch ? clean(`${text.slice(0, teacherMatch.index)} ${text.slice((teacherMatch.index || 0) + teacherMatch[0].length)}`) : text
  if (!teacher) {
    // A physical timetable cell is read top-to-bottom. Once a standalone
    // room row is reached, later rows are faculty metadata even when OCR lost
    // the Dr/Ms prefix; they must never become a second subject.
    const roomLine = lines.findIndex(isRoomMetadata)
    if (roomLine >= 0 && roomLine < lines.length - 1) {
      teacher = clean(lines.slice(roomLine + 1).join(' '))
      text = clean(lines.slice(0, roomLine + 1).join(' '))
      remaining = text
    }
  }
  if (!teacher) {
    const untitledLabTeacher = remaining.match(/^(.*?\blab)\s+([a-z][a-z .'-]+?)\s+(\d{2,4}(?:\s*-\s*\d{2,4})?)$/i)
    if (untitledLabTeacher) {
      remaining = clean(`${untitledLabTeacher[1]} ${untitledLabTeacher[3]}`)
      teacher = clean(untitledLabTeacher[2])
    }
  }
  const roomMatches = [...remaining.matchAll(/(?:^|\s)((?:\d{2,4}(?:\s*-\s*\d{2,4})?|(?:nf|nfc)\s*\d+))(?=\s|$)/gi)]
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
  crossGridLines: number[] = [],
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
    const relevantGridLines = [...crossGridLines]
      .filter(line => line >= dayStart - lineTolerance && line <= dayEnd + lineTolerance)
      .sort((a, b) => a - b)
    let subrows: OcrBox[][][]
    if (relevantGridLines.length >= 2) {
      const byBand = new Map<number, OcrBox[][]>()
      for (const line of visualLines) {
        const position = daysAreRows ? centerY(line[0]) : centerX(line[0])
        let band = 0
        while (band < relevantGridLines.length && position > relevantGridLines[band]) band++
        const existing = byBand.get(band) || []
        existing.push(line)
        byBand.set(band, existing)
      }
      subrows = [...byBand.entries()].sort(([left], [right]) => left - right).map(([, lines]) => lines)
    } else {
      const subrowSize = Math.max(1, (dayEnd - dayStart) / 3)
      subrows = [0, 1, 2].map(subrow => visualLines.filter(line => {
        const position = daysAreRows ? centerY(line[0]) : centerX(line[0])
        return Math.max(0, Math.min(2, Math.floor((position - dayStart) / subrowSize))) === subrow
      }))
    }
    const rowTexts = subrows.map(lines => clean(lines.map(line => clean([...line]
      .sort((a, b) => daysAreRows ? a.left - b.left : a.top - b.top)
      .map(item => item.text).join(' '))).join(' '))).filter(Boolean)
    // A merged cell can wrap "Subject name" and "Lab · teacher · room"
    // across adjacent detected row bands. Join that continuation before
    // deciding whether the bands are separate lab-group alternatives.
    const logicalTexts: string[] = []
    for (const text of rowTexts) {
      const previous = logicalTexts.at(-1)
      const startsAsContinuation = /^lab\b/i.test(text)
        || (/^(?:dr|mr|ms|mrs|prof)\.?\b/i.test(text) && !!previous && /\blab\b/i.test(previous))
      if (previous && startsAsContinuation) logicalTexts[logicalTexts.length - 1] = clean(`${previous} ${text}`)
      else logicalTexts.push(text)
    }
    const entries = logicalTexts.map(text => parseCellEntry([text]))
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
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
    const groupWidth = daysAreRows
      ? Math.max(...group.map(item => item.right)) - Math.min(...group.map(item => item.left))
      : Math.max(...group.map(item => item.bottom)) - Math.min(...group.map(item => item.top))
    const spansNextPeriod = index < anchors.length - 1 && (
      Math.abs(groupPosition - (anchors[index] + anchors[index + 1]) / 2) <= (anchors[index + 1] - anchors[index]) * 0.22
      || groupWidth >= (anchors[index + 1] - anchors[index]) * 1.22
    )
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

  let markers = [...(scan.gridCells || []), ...scan.elements]
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
  const periodTimes = completePeriodTimes(extractPeriodTimes(scan, daysAreRows, markers, periodAnchors), periodAnchors)
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
  const structure = constructGridDays(scan, markers, periodAnchors, daysAreRows, parseCellEntry)
  const rows: { day: (typeof DAYS)[number]; cells: Cell[] }[] = structure?.rows || []
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
      ? groupCellsByAnchors(
          candidates,
          periodAnchors,
          daysAreRows,
          bounds.start,
          bounds.end,
          daysAreRows ? scan.gridHorizontalLines || [] : scan.gridVerticalLines || [],
        )
      : daysAreRows
      ? groupCells(candidates, scan.width)
      : groupCells(candidates.map(item => ({
          ...item,
          left: item.top,
          right: item.bottom,
          top: item.left,
          bottom: item.right,
        })), scan.height)

    if (structure) {
      // Grid geometry is authoritative, but a faint/broken rule can make one
      // otherwise readable physical cell disappear from the reconstructed
      // grid.  Use the independent positioned-text path only to fill a period
      // that the grid left empty; never replace a structured cell or grouped
      // lab.  This gives the two recognition strategies true failover instead
      // of discarding all loose OCR as soon as any grid was detected.
      const structuredRow = rows.find(row => row.day.number === marker.day.number)
      if (structuredRow) {
        const occupied = new Set(structuredRow.cells.flatMap(cell => {
          const end = cell.endPeriod || (cell.spansNextPeriod ? cell.period + 1 : cell.period)
          return Array.from({ length: Math.max(1, end - cell.period + 1) }, (_, index) => cell.period + index)
        }))
        structuredRow.cells.push(...ordered.filter(cell => !occupied.has(cell.period)))
        structuredRow.cells.sort((left, right) => left.period - right.period)
      }
    } else rows.push({ day: marker.day, cells: ordered })
  }

  const subjectByKey = new Map<string, Subject>()
  const timetable: TimetableSlot[] = []
  const labGroups: TimetableLabGroupChoice[] = []
  const personKey = (value: string) => clean(value)
    .replace(/^(?:dr|mr|ms|mrs|prof)\.?\s+/i, '')
    .toLowerCase().replace(/[^a-z]/g, '')
  const teacherSamples = rows.flatMap(row => row.cells.flatMap(cell => [
    cell.teacher,
    ...(cell.alternatives || []).map(option => option?.teacher),
  ])).filter((value): value is string => !!value)
  const teacherStats = new Map<string, { count: number; display: string }>()
  for (const sample of teacherSamples) {
    const key = personKey(sample)
    if (key.length < 4) continue
    const current = teacherStats.get(key)
    teacherStats.set(key, { count: (current?.count || 0) + 1, display: current?.display || clean(sample) })
  }
  const knownTeachers = new Set(teacherStats.keys())
  const personWords = (value: string) => clean(value).replace(/^(?:dr|mr|ms|mrs|prof)\.?\s*/i, '').toLowerCase()
    .replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
  const canonicalTeacher = (value?: string) => {
    if (!value) return undefined
    const key = personKey(value), rawWords = personWords(value)
    let best: { distance: number; count: number; display: string } | undefined
    for (const [candidate, stats] of teacherStats) {
      const distance = editDistance(key, candidate)
      const candidateWords = personWords(stats.display)
      const sameOuterName = rawWords.length >= 2 && candidateWords.length >= 2
        && editDistance(rawWords[0], candidateWords[0]) <= 2
        && rawWords.at(-1) === candidateWords.at(-1)
      if (distance > 2 && !sameOuterName) continue
      if (!best || stats.count > best.count || (stats.count === best.count && distance < best.distance)) {
        best = { distance, count: stats.count, display: stats.display }
      }
    }
    return best?.display || clean(value)
  }
  const looksLikeKnownTeacher = (value: string) => {
    const key = personKey(value)
    if (key.length < 4) return false
    if (knownTeachers.has(key)) return true
    const rawWords = personWords(value)
    for (const [candidate, stats] of teacherStats) {
      const length = Math.max(key.length, candidate.length)
      if (length >= 6 && editDistance(key, candidate) <= Math.max(2, Math.floor(length * 0.18))) return true
      const candidateWords = personWords(stats.display)
      if (rawWords.length >= 2 && candidateWords.length >= 2) {
        const firstDistance = editDistance(rawWords[0], candidateWords[0])
        const lastDistance = editDistance(rawWords.at(-1)!, candidateWords.at(-1)!)
        if (firstDistance <= (rawWords[0].length >= 6 ? 2 : 1)
          && lastDistance <= (rawWords.at(-1)!.length >= 6 ? 2 : 1)) return true
      }
    }
    return false
  }
  let rejectedTeacherCells = 0

  const rawLectureBases = rows.flatMap(row => row.cells.flatMap(cell => {
    if (cell.alternatives?.length || /\blab\b/i.test(cell.text)) return []
    const name = titleCase(cell.text)
    return name.length >= 4 && name.length <= 80 && !isNoise(name) && !BREAK_WORDS.test(name)
      && !looksLikeKnownTeacher(name) ? [name] : []
  }))
  const comparisonKey = (value: string) => repairAcademicText(value).toLowerCase()
    .replace(/\b(?:laboratory|practical)\b/g, 'lab')
    .replace(/\blab\b/g, '')
    .replace(/0/g, 'o').replace(/[1|]/g, 'i').replace(/5/g, 's').replace(/rn/g, 'm')
    .replace(/[^a-z0-9+]+/g, '')
  const subjectSimilarity = (left: string, right: string) => {
    // A qualifier changes the course identity.  In particular, "Object
    // Oriented Programming" and "... Programming using C++" are separate
    // subjects in many timetables and must not be merged merely because most
    // of their characters match.  A damaged language token may disappear,
    // but "using" itself is normally retained and remains the boundary.
    const leftHasUsing = /\busing\b/i.test(left), rightHasUsing = /\busing\b/i.test(right)
    if (leftHasUsing !== rightHasUsing) return 0
    const a = comparisonKey(left), b = comparisonKey(right)
    if (!a || !b) return 0
    const characterScore = 1 - editDistance(a, b) / Math.max(a.length, b.length)
    const leftWords = repairAcademicText(left).toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/).filter(Boolean)
    const rightWords = repairAcademicText(right).toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/).filter(Boolean)
    const matched = leftWords.filter(word => rightWords.some(candidate => {
      const allowance = Math.max(word.length, candidate.length) >= 7 ? 2 : 1
      return editDistance(word, candidate) <= allowance
    })).length
    const wordScore = matched / Math.max(leftWords.length, rightWords.length, 1)
    return Math.max(characterScore, characterScore * 0.55 + wordScore * 0.45)
  }
  type SubjectCluster = { samples: string[] }
  const lectureClusters: SubjectCluster[] = []
  for (const sample of rawLectureBases) {
    let best: { cluster: SubjectCluster; score: number } | undefined
    for (const cluster of lectureClusters) {
      const score = Math.max(...cluster.samples.map(existing => subjectSimilarity(sample, existing)))
      if (score >= 0.72 && (!best || score > best.score)) best = { cluster, score }
    }
    if (best) best.cluster.samples.push(sample)
    else lectureClusters.push({ samples: [sample] })
  }
  const sampleQuality = (value: string, cluster: SubjectCluster) => {
    const repeated = cluster.samples.filter(sample => comparisonKey(sample) === comparisonKey(value)).length
    const consensus = cluster.samples.reduce((total, sample) => total + subjectSimilarity(value, sample), 0)
    const suspicious = (value.match(/\b[a-z]{1,2}\b/gi) || []).length + (value.match(/\d/g) || []).length
    const explicitLanguage = /(?:c\s*\+\+|java|python|javascript|kotlin|swift)\b/i.test(value) ? 4 : 0
    const danglingUsing = /\busing\s*$/i.test(value) ? 4 : 0
    return repeated * 12 + consensus * 4 + repairAcademicText(value).length * 0.02
      + explicitLanguage - suspicious * 2 - danglingUsing
  }
  const lectureBases = lectureClusters.map(cluster => [...new Set(cluster.samples)]
    .sort((left, right) => sampleQuality(right, cluster) - sampleQuality(left, cluster))[0])
  const canonicalLectureName = (value: string) => {
    const repaired = titleCase(value)
    let best: { name: string; score: number } | undefined
    for (const base of lectureBases) {
      const score = subjectSimilarity(repaired, base)
      if (score >= 0.72 && (!best || score > best.score)) best = { name: base, score }
    }
    return best?.name || repaired
  }
  const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').split(' ').filter(word => word.length >= 2)
  const canonicalLabName = (value: string) => {
    const repaired = titleCase(value)
    if (!/\blab\b/i.test(repaired)) return canonicalLectureName(repaired)
    const rawWords = words(repaired).filter(word => word !== 'lab')
    let best: { name: string; matches: number; coverage: number } | undefined
    for (const base of lectureBases) {
      const baseWords = words(base)
      if (baseWords.length < 2) continue
      const matches = baseWords.filter(baseWord => rawWords.some(rawWord => {
        const allowance = Math.max(baseWord.length, rawWord.length) >= 7 ? 2 : 1
        return editDistance(baseWord, rawWord) <= allowance
      })).length
      const coverage = matches / baseWords.length
      if (matches >= 2 && coverage >= 0.6 && (!best || matches > best.matches || (matches === best.matches && coverage > best.coverage))) {
        best = { name: `${base} Lab`, matches, coverage }
      }
    }
    return best?.name || repaired
  }

  const getSubject = (rawName: string) => {
    const name = canonicalLabName(rawName)
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
      if (!name || BREAK_WORDS.test(name) || isNoise(name) || /^(?:dr|mr|ms|mrs|prof)\b/i.test(name)) return
      // If the same person was recognized as faculty elsewhere (usually from
      // the row below a room number), a title-less OCR copy is still faculty,
      // not a new subject.
      if (looksLikeKnownTeacher(name)) { rejectedTeacherCells++; return }
      const period = cell.period
      const time = periodTimes[period - 1] || defaultTime(period)
      if (cell.alternatives?.length) {
        const options = cell.alternatives.map(option => {
          if (!option) return null
          const subject = getSubject(option.name)
          return subject ? { subjectId: subject.id, name: subject.name, room: option.room, teacher: canonicalTeacher(option.teacher) } : null
        })
        if (options.some(Boolean)) {
          const endPeriod = cell.endPeriod || (cell.spansNextPeriod ? period + 1 : period)
          const labTime = endPeriod > period
            ? { startTime: time.startTime, endTime: (periodTimes[endPeriod - 1] || defaultTime(endPeriod)).endTime }
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
        ...((cell.endPeriod || (cell.spansNextPeriod ? period + 1 : period)) > period
          ? { endTime: (periodTimes[(cell.endPeriod || period + 1) - 1] || defaultTime(cell.endPeriod || period + 1)).endTime }
          : {}),
        room: cell.room,
        teacher: canonicalTeacher(cell.teacher),
      })
    })
  }

  if (timetable.length + labGroups.length < 2 || subjectByKey.size === 0) {
    throw new Error('Text was detected, but a reliable timetable could not be built. Crop the image to the timetable grid and try again.')
  }

  const detectedDays = rows.filter(row => row.cells.length > 0).map(row => row.day.label)
  const warnings: string[] = []
  if (structure) warnings.push(...structure.warnings)
  if (rejectedTeacherCells) warnings.push(`${rejectedTeacherCells} faculty-name cell${rejectedTeacherCells === 1 ? ' was' : 's were'} excluded from subjects. Review the affected periods.`)
  const expectedDays = markers.some(marker => marker.day.number > 5) ? Math.max(...markers.map(marker => marker.day.number)) : 5
  if (detectedDays.length < expectedDays) warnings.push(`Only ${detectedDays.length} class day${detectedDays.length === 1 ? '' : 's'} were detected. Add any missing day manually before applying.`)
  const periodCount = Math.max(periodAnchors.length, ...rows.flatMap(row => row.cells.map(cell => cell.period)), 0)
  const sparseDays = rows.filter(row => row.cells.length > 0 && periodCount > 0 && row.cells.length < Math.max(1, Math.ceil(periodCount * 0.4)))
  if (sparseDays.length) warnings.push(`Very few periods were read for ${sparseDays.map(row => row.day.label).join(', ')}. Check those days carefully.`)
  if (periodAnchors.length < 2) warnings.push('Period headers were not detected reliably, so period positions were estimated from the timetable layout.')
  if (scan.fullText.length < 30) warnings.push('Only a small amount of text was readable; review every generated period.')
  warnings.push(periodTimes.some(Boolean)
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
    labGroups: labGroups.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period),
    groupCount: Math.max(0, ...labGroups.map(choice => choice.options.length)),
  }
}

export function selectTimetableLabGroup(
  imported: TimetableImageImport,
  group: number,
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
