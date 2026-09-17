import type { Cell, OcrBox, TimetableOcrResult } from './timetableImageParser'

type Day = { number: number; label: string; aliases: string[] }
type Entry = { name: string; room?: string; teacher?: string }
type GridCell = NonNullable<TimetableOcrResult['gridCells']>[number]
const middleX = (box: OcrBox) => (box.left + box.right) / 2
const middleY = (box: OcrBox) => (box.top + box.bottom) / 2
const isStaff = (text: string) => /^(?:(?:dr|mr|ms|mrs|prof)\.?\s|faculty\b|teacher\b)/i.test(text.trim())
const isEmpty = (text: string) => !text.trim() || /^(?:[-–—]+|free|no class|nil|n\/a)$/i.test(text.trim())
const isBreak = (text: string) => /^(?:lunch(?:break)?|break|recess)$/i.test(text.replace(/\s/g, ''))
const isRoom = (text: string) => /^(?:room\s*)?(?:\d{2,4}(?:\s*[-–]\s*\d{2,4})?|[a-z]{1,3}[- ]?\d{1,4})$/i.test(text.trim())
const isLab = (text: string) => /\b(?:lab(?:oratory)?|practical)\b/i.test(text)

/** Interpret physical table cells before classifying their text. No empty
 * cell is removed until its group index and merged period span are known. */
export function constructGridDays(
  scan: TimetableOcrResult,
  markers: { box: OcrBox; day: Day }[],
  anchors: number[],
  daysAreRows: boolean,
  parseEntry: (lines: string[]) => Entry | null,
) {
  if (!scan.gridCells?.length || anchors.length < 2) return null
  // Normalize only the geometry; reading order of text remains normal.
  const transpose = <T extends OcrBox>(cell: T): T => daysAreRows ? cell : {
    ...cell, left: cell.top, top: cell.left, right: cell.bottom, bottom: cell.right,
  }
  const cells = scan.gridCells.map(transpose)
  const dayCells = markers.map(marker => {
    const point = transpose(marker.box)
    const physical = cells.filter(cell => middleX(point) >= cell.left && middleX(point) <= cell.right
      && middleY(point) >= cell.top && middleY(point) <= cell.bottom)
      .sort((a, b) => (a.right - a.left) * (a.bottom - a.top) - (b.right - b.left) * (b.bottom - b.top))[0]
    return physical ? { day: marker.day, bounds: physical } : null
  }).filter((item): item is NonNullable<typeof item> => !!item)
  if (dayCells.length < 2) return null
  // Each label must occupy a separate day band; otherwise the grid is damaged.
  if (dayCells.some((item, index) => dayCells.some((other, otherIndex) => otherIndex !== index
    && middleY(other.bounds) > item.bounds.top && middleY(other.bounds) < item.bounds.bottom))) return null

  const warnings: string[] = []
  const read = (cell: GridCell) => {
    // Cell OCR is isolated from its neighbours. Use positioned words only
    // when the dedicated read failed; never borrow a line spanning two cells.
    if (cell.text.trim()) return cell.text.replace(/\r/g, '').trim()
    if (cell.hasInk === false) return ''
    const words = scan.elements.filter(word => {
      const point = transpose(word)
      return middleX(point) > cell.left && middleX(point) < cell.right
        && middleY(point) > cell.top && middleY(point) < cell.bottom
    }).sort((a, b) => a.top - b.top || a.left - b.left)
    return words.map(word => word.text).join(' ').trim()
  }
  const datasets = dayCells.map(({ day, bounds }) => {
    let body = cells.filter(cell => cell.left >= bounds.right - 2
      && cell.top >= bounds.top - 2 && cell.bottom <= bounds.bottom + 2)
    // Repair a merged lab whose internal period rule was falsely detected
    // because text strokes crossed that boundary. Only join same-lane
    // neighbours when their combined text is a lab and at least one fragment
    // is missing normal room metadata; two complete adjacent classes remain
    // separate.
    const horizontallyRepaired = new Set<GridCell>()
    let repaired = true
    while (repaired) {
      repaired = false
      outer: for (let leftIndex = 0; leftIndex < body.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < body.length; rightIndex += 1) {
          if (leftIndex === rightIndex) continue
          const left = body[leftIndex], right = body[rightIndex]
          if (horizontallyRepaired.has(left) || horizontallyRepaired.has(right)) continue
          const tolerance = Math.max(3, (left.bottom - left.top) * 0.08)
          if (Math.abs(left.right - right.left) > tolerance
            || Math.abs(left.top - right.top) > tolerance || Math.abs(left.bottom - right.bottom) > tolerance) continue
          const leftText = read(left), rightText = read(right), combined = `${leftText} ${rightText}`.trim()
          if (isEmpty(leftText) || isEmpty(rightText)) continue
          if (!isLab(combined) || (!isLab(leftText) && !isLab(rightText))) continue
          const leftEntry = parseEntry(leftText.split('\n')), rightEntry = parseEntry(rightText.split('\n'))
          if (leftEntry?.room && rightEntry?.room) continue
          if (leftEntry?.room && !rightEntry?.room && !isLab(rightText)) continue
          if (!leftEntry?.room && !rightEntry?.room && !(isLab(leftText) && isLab(rightText))) continue
          const joined: GridCell = {
            ...left,
            left: Math.min(left.left, right.left), top: Math.min(left.top, right.top),
            right: Math.max(left.right, right.right), bottom: Math.max(left.bottom, right.bottom),
            text: [leftText, rightText].filter(Boolean).join('\n'),
            lines: [...(left.lines || []), ...(right.lines || [])],
            hasInk: left.hasInk !== false || right.hasInk !== false,
          }
          body = body.filter((_, index) => index !== leftIndex && index !== rightIndex).concat(joined)
          horizontallyRepaired.add(joined)
          repaired = true
          break outer
        }
      }
    }
    const spans = new Map<string, GridCell[]>()
    for (const cell of body) {
      const covered = anchors.map((anchor, index) => ({ anchor, period: index + 1 }))
        .filter(({ anchor }) => anchor > cell.left && anchor < cell.right)
      if (!covered.length) continue // unnumbered lunch column
      const key = `${covered[0].period}:${covered.at(-1)!.period}`
      spans.set(key, [...spans.get(key) || [], cell])
    }
    return { day, bounds, spans }
  })
  // Learn the presence/count of group lanes from actual repeated lab cells,
  // including their blank siblings. A full-height lab remains a shared class.
  let groupCount = 0
  for (const data of datasets) for (const cells of data.spans.values()) {
    const texts = cells.map(read)
    const labCount = texts.filter(isLab).length
    const blankCount = texts.filter(isEmpty).length
    const heights = cells.map(cell => cell.bottom - cell.top)
    const medianHeight = [...heights].sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 1
    const comparableLanes = heights.every(height => height >= medianHeight * 0.55 && height <= medianHeight * 1.8)
    // One readable lab plus blank sibling lanes is enough evidence. Requiring
    // two readable names caused a blank G1/G2 to shift G3 into the wrong group.
    // Equal-height geometry prevents a normal subject/room/teacher stack from
    // being mistaken for group alternatives.
    if (labCount >= 1 && cells.length >= 2 && cells.length <= 8 && comparableLanes
      && (labCount >= 2 || blankCount >= 1)) groupCount = Math.max(groupCount, cells.length)
  }

  const rows = datasets.map(({ day, bounds, spans }) => {
    const output: Cell[] = []
    for (const [key, physicalCells] of spans) {
      const [period, endPeriod] = key.split(':').map(Number)
      const ordered = [...physicalCells].sort((a, b) => a.top - b.top)
      const texts = ordered.map(read)
      const labs = texts.filter(isLab)
      const grouped = groupCount >= 2 && labs.length > 0 && ordered.length === groupCount
        && ordered.every(cell => cell.bottom - cell.top < (bounds.bottom - bounds.top) * 0.8)
      const rectangle = {
        left: Math.min(...ordered.map(cell => cell.left)), right: Math.max(...ordered.map(cell => cell.right)),
        top: Math.min(...ordered.map(cell => cell.top)), bottom: Math.max(...ordered.map(cell => cell.bottom)),
      }
      if (grouped) {
        const alternatives = texts.map((text, index) => {
          if (isEmpty(text)) {
            if (ordered[index].hasInk) warnings.push(`${day.label} P${period}: group ${index + 1} has unreadable text; check the image.`)
            return null
          }
          if (isStaff(text) || isRoom(text) || isBreak(text)) return null
          const entry = parseEntry(text.split('\n'))
          if (entry?.name && isLab(text) && !isLab(entry.name)) entry.name = `${entry.name} Lab`
          return entry?.name ? entry : null
        })
        const first = alternatives.find(entry => !!entry)
        if (first) output.push({ ...rectangle, text: first.name, period, endPeriod, alternatives })
        continue
      }
      const nonempty = texts.map((text, index) => ({ text, index })).filter(item => !isEmpty(item.text))
      if (!nonempty.length || nonempty.every(item => isBreak(item.text))) continue
      // A lecture block reads top-to-bottom: name (possibly wrapped), room,
      // faculty. Once metadata starts, following text cannot become a subject.
      const subjectParts: string[] = []
      let room: string | undefined, teacher: string | undefined
      let metadata = false
      for (const { text } of nonempty) {
        if (isStaff(text)) { teacher = [teacher, text.replace(/\n/g, ' ')].filter(Boolean).join(' '); metadata = true; continue }
        if (isRoom(text)) { room = text.replace(/\s/g, ''); metadata = true; continue }
        if (metadata) { teacher = [teacher, text.replace(/\n/g, ' ')].filter(Boolean).join(' '); continue }
        subjectParts.push(text)
      }
      if (!subjectParts.length) continue
      const entry = parseEntry(subjectParts)
      if (!entry?.name || isStaff(entry.name) || isRoom(entry.name) || isBreak(entry.name)) continue
      output.push({ ...rectangle, text: entry.name, period, endPeriod, room: room || entry.room, teacher: teacher || entry.teacher })
    }
    return { day, cells: output }
  })
  return { rows, warnings }
}
