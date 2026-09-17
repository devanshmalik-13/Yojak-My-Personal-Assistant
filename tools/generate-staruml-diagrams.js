import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const outPath = path.join(__dirname, '..', 'docs', 'My-Personal-Assistant-DFD-ERD.mdj')

const id = () => crypto.randomBytes(16).toString('base64')
const ref = value => ({ $ref: value })
const projectId = id()
const project = {
  _type: 'Project',
  _id: projectId,
  name: 'My Personal Assistant - DFD and ERD',
  author: 'OpenAI Codex',
  company: 'My Personal Assistant',
  copyright: 'Architecture model derived from the application source code',
  version: '1.0',
  ownedElements: [],
}

function label(parentId, text, left, top, width, opts = {}) {
  return {
    _type: opts.edge ? 'EdgeLabelView' : 'LabelView',
    _id: id(),
    _parent: ref(parentId),
    ...(opts.modelId ? { model: ref(opts.modelId) } : {}),
    font: opts.bold ? 'Arial;13;1' : 'Arial;13;0',
    fontColor: opts.fontColor || '#172554',
    left,
    top,
    width: width || Math.max(30, text.length * 7),
    height: opts.height || 16,
    text,
    wordWrap: true,
    ...(opts.edge ? {
      alpha: Math.PI / 2,
      distance: 15,
      hostEdge: ref(parentId),
      edgePosition: opts.edgePosition || 1,
    } : {}),
  }
}

const overlaps = (a, b, padding = 0) =>
  a.x < b.x + b.w + padding && a.x + a.w + padding > b.x &&
  a.y < b.y + b.h + padding && a.y + a.h + padding > b.y

function orthogonalRoute(allNodes, source, target, usedEdges, portUsage = new Map(), step = 20) {
  const sx = source.x + source.w / 2, sy = source.y + source.h / 2
  const tx = target.x + target.w / 2, ty = target.y + target.h / 2
  const horizontal = Math.abs(tx - sx) >= Math.abs(ty - sy)
  const dir = horizontal ? (tx >= sx ? 1 : -1) : (ty >= sy ? 1 : -1)
  const portOffset = (node, side, span) => {
    const portKey = `${node.node?._id || node.entity?._id || node.view?._id}:${side}`
    const count = portUsage.get(portKey) || 0
    portUsage.set(portKey, count + 1)
    const sequence = [0, -1, 1, -2, 2, -3, 3, -4, 4]
    const desired = sequence[count % sequence.length] * 18
    const limit = Math.max(10, span / 2 - 10)
    return Math.max(-limit, Math.min(limit, desired))
  }
  const sourceSide = horizontal ? (dir > 0 ? 'right' : 'left') : (dir > 0 ? 'bottom' : 'top')
  const targetSide = horizontal ? (dir > 0 ? 'left' : 'right') : (dir > 0 ? 'top' : 'bottom')
  const sourceOffset = portOffset(source, sourceSide, horizontal ? source.h : source.w)
  const targetOffset = portOffset(target, targetSide, horizontal ? target.h : target.w)
  const startBorder = horizontal
    ? { x: dir > 0 ? source.x + source.w : source.x, y: sy + sourceOffset }
    : { x: sx + sourceOffset, y: dir > 0 ? source.y + source.h : source.y }
  const endBorder = horizontal
    ? { x: dir > 0 ? target.x : target.x + target.w, y: ty + targetOffset }
    : { x: tx + targetOffset, y: dir > 0 ? target.y : target.y + target.h }
  const start = horizontal ? { x: startBorder.x + dir * step, y: startBorder.y } : { x: startBorder.x, y: startBorder.y + dir * step }
  const end = horizontal ? { x: endBorder.x - dir * step, y: endBorder.y } : { x: endBorder.x, y: endBorder.y - dir * step }
  const snap = p => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step })
  const a = snap(start), b = snap(end)
  const obstacles = [...allNodes].filter(n => n !== source && n !== target).map(n => ({ x: n.x - 14, y: n.y - 14, w: n.w + 28, h: n.h + 28 }))
  const blocked = p => obstacles.some(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
  const key = p => `${p.x},${p.y}`
  const edgeKey = (p, q) => [key(p), key(q)].sort().join('|')
  const open = [{ ...a, g: 0, f: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), prev: null }]
  const best = new Map([[key(a), 0]])
  let goal = null
  let guard = 0
  while (open.length && guard++ < 25000) {
    open.sort((m, n) => m.f - n.f)
    const cur = open.shift()
    if (cur.x === b.x && cur.y === b.y) { goal = cur; break }
    for (const [dx, dy] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const next = { x: cur.x + dx, y: cur.y + dy }
      if (next.x < 0 || next.y < 0 || next.x > 1800 || next.y > 1700 || blocked(next)) continue
      if (usedEdges.has(edgeKey(cur, next))) continue
      if (usedEdges.has(`P:${key(next)}`) && !(next.x === b.x && next.y === b.y) && !(cur.x === a.x && cur.y === a.y)) continue
      const turn = cur.prev && ((cur.x - cur.prev.x) !== dx || (cur.y - cur.prev.y) !== dy) ? 8 : 0
      const g = cur.g + step + turn
      if (g >= (best.get(key(next)) ?? Infinity)) continue
      best.set(key(next), g)
      open.push({ ...next, g, f: g + Math.abs(next.x - b.x) + Math.abs(next.y - b.y), prev: cur })
    }
  }
  let grid = []
  if (goal) for (let p = goal; p; p = p.prev) grid.push({ x: p.x, y: p.y })
  grid.reverse()
  if (!grid.length) grid = horizontal ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b] : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b]
  const startStub = horizontal ? { x: start.x, y: startBorder.y } : { x: startBorder.x, y: start.y }
  const endStub = horizontal ? { x: end.x, y: endBorder.y } : { x: endBorder.x, y: end.y }
  const raw = [startBorder, startStub, a, ...grid, b, endStub, endBorder]
  const points = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y)
  const simple = points.filter((p, i) => i === 0 || i === points.length - 1 || !((points[i-1].x === p.x && p.x === points[i+1].x) || (points[i-1].y === p.y && p.y === points[i+1].y)))
  for (let i = 1; i < grid.length; i++) usedEdges.add(edgeKey(grid[i - 1], grid[i]))
  for (let i = 1; i < grid.length - 1; i++) usedEdges.add(`P:${key(grid[i])}`)
  return simple
}

function placeEdgeLabel(points, text, nodes, placed, width = 170, height = 34) {
  const nodeList = [...nodes]
  const segments = points.slice(1).map((p, i) => ({ a: points[i], b: p, length: Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y) })).sort((a,b) => b.length - a.length)
  for (const segment of segments) {
    const horizontal = segment.a.y === segment.b.y
    for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      for (const gap of [10, 28, 50]) {
        for (const side of [-1, 1]) {
          const cx = segment.a.x + (segment.b.x - segment.a.x) * t
          const cy = segment.a.y + (segment.b.y - segment.a.y) * t
          const x = horizontal ? cx - width / 2 : segment.a.x + (side > 0 ? gap : -width - gap)
          const y = horizontal ? segment.a.y + (side > 0 ? gap : -height - gap) : cy - height / 2
          const box = { x, y, w: width, h: height }
          if (x >= 0 && y >= 0 && !nodeList.some(n => overlaps(box, n, 4)) && !placed.some(n => overlaps(box, n, 4))) {
            placed.push(box)
            return box
          }
        }
      }
    }
  }
  const p = points[Math.floor(points.length / 2)]
  for (let radius = 40; radius <= 400; radius += 20) {
    for (const [dx,dy] of [[radius,0],[-radius,0],[0,radius],[0,-radius],[radius,radius],[-radius,radius],[radius,-radius],[-radius,-radius]]) {
      const box = { x: p.x + dx, y: p.y + dy, w: width, h: height }
      if (box.x >= 0 && box.y >= 0 && !nodeList.some(n => overlaps(box, n, 4)) && !placed.some(n => overlaps(box, n, 4))) {
        placed.push(box)
        return box
      }
    }
  }
  const box = { x: p.x + 8, y: p.y - height - 8, w: width, h: height }
  placed.push(box)
  return box
}

function createDfdModel() {
  const modelId = id()
  const model = {
    _type: 'DFDDataFlowModel',
    _id: modelId,
    _parent: ref(projectId),
    name: 'Data Flow Model',
    documentation: 'Three-level data-flow decomposition of the offline-first My Personal Assistant application.',
    ownedElements: [],
  }
  project.ownedElements.push(model)

  function createDiagram(name, description, isDefault = false) {
    const diagramId = id()
    const diagram = {
      _type: 'DFDDiagram', _id: diagramId, _parent: ref(modelId), name,
      documentation: description, defaultDiagram: isDefault, visible: true, ownedViews: [],
    }
    model.ownedElements.push(diagram)
    const nodes = new Map()
    const usedEdges = new Set()
    const portUsage = new Map()
    const placedLabels = []

    function addNode(key, type, nameText, x, y, w = 170, h = 72, number = '') {
      const modelType = type === 'external' ? 'DFDExternalEntity' : type === 'store' ? 'DFDDataStore' : 'DFDProcess'
      const viewType = `${modelType}View`
      const nodeId = id()
      const viewId = id()
      const node = {
        _type: modelType, _id: nodeId, _parent: ref(modelId), name: nameText,
        ...(number ? { id: number } : {}), ownedElements: [],
      }
      model.ownedElements.push(node)
      const nameTop = type === 'process' ? y + 30 : y + 18
      const nameLabel = label(viewId, nameText, x + 12, nameTop, w - 24, { bold: type !== 'store', height: h - 34 })
      const subViews = [nameLabel]
      const view = {
        _type: viewType, _id: viewId, _parent: ref(diagramId), model: ref(nodeId), subViews,
        font: 'Arial;13;0', lineColor: '#1E3A8A', fillColor: type === 'process' ? '#DBEAFE' : type === 'store' ? '#ECFDF5' : '#FEF3C7',
        fontColor: '#172554', showShadow: true, left: x, top: y, width: w, height: h,
        nameLabel: ref(nameLabel._id),
      }
      if (type !== 'external') {
        const idLabel = label(viewId, number, x + 10, y + 5, 55, { bold: true })
        subViews.push(idLabel)
        view.idLabel = ref(idLabel._id)
      }
      diagram.ownedViews.push(view)
      nodes.set(key, { node, view, x, y, w, h })
      return nodes.get(key)
    }

    function addFlow(sourceKey, targetKey, flowName) {
      const source = nodes.get(sourceKey)
      const target = nodes.get(targetKey)
      if (!source || !target) throw new Error(`Missing DFD endpoint: ${sourceKey} -> ${targetKey}`)
      const flowId = id()
      const viewId = id()
      const flow = {
        _type: 'DFDDataFlow', _id: flowId, _parent: ref(source.node._id), name: flowName,
        source: ref(source.node._id), target: ref(target.node._id),
      }
      source.node.ownedElements.push(flow)
      const route = orthogonalRoute(nodes.values(), source, target, usedEdges, portUsage)
      const labelBox = placeEdgeLabel(route, flowName, nodes.values(), placedLabels, 190, 34)
      const nameLabel = label(viewId, flowName, labelBox.x, labelBox.y, labelBox.w, { edge: true, modelId: flowId, height: labelBox.h })
      const view = {
        _type: 'DFDDataFlowView', _id: viewId, _parent: ref(diagramId), model: ref(flowId), subViews: [nameLabel],
        font: 'Arial;12;0', lineColor: '#334155', head: ref(target.view._id), tail: ref(source.view._id),
        lineStyle: 2, points: route.map(p => `${Math.round(p.x)}:${Math.round(p.y)}`).join(';'), nameLabel: ref(nameLabel._id),
      }
      diagram.ownedViews.push(view)
    }
    return { addNode, addFlow }
  }

  // Level 0: context diagram
  {
    const d = createDiagram('DFD Level 0 - Context', 'Context view showing the app boundary and its external actors.', true)
    d.addNode('user', 'external', 'Student / App User', 40, 260, 190, 64)
    d.addNode('app', 'process', 'My Personal Assistant', 390, 220, 260, 140, '0')
    d.addNode('device', 'external', 'Device OS, Scanner & File System', 820, 100, 250, 72)
    d.addNode('notify', 'external', 'Local Notification Service', 820, 390, 250, 72)
    d.addFlow('user', 'app', 'profile, timetable, attendance, tasks, reminders, expenses')
    d.addFlow('app', 'user', 'dashboard, schedules, statistics, alerts, search results')
    d.addFlow('device', 'app', 'scanned timetable, attachments, backup archive')
    d.addFlow('app', 'device', 'private files and backup export')
    d.addFlow('app', 'notify', 'notification schedule / cancellation')
    d.addFlow('notify', 'user', 'due-date and reminder notifications')
  }

  // Level 1: major functional processes and persistent stores
  {
    const d = createDiagram('DFD Level 1 - Major Processes', 'Top-level decomposition into profile, academics, productivity, notification, finance, and continuity processes.')
    d.addNode('user1', 'external', 'Student / App User', 30, 70, 170, 64)
    d.addNode('user2', 'external', 'Student / App User', 30, 240, 170, 64)
    d.addNode('user3', 'external', 'Student / App User', 30, 420, 170, 64)
    d.addNode('user4', 'external', 'Student / App User', 30, 610, 170, 64)
    d.addNode('user5', 'external', 'Student / App User', 30, 800, 170, 64)
    d.addNode('user6', 'external', 'Student / App User', 30, 990, 170, 64)
    d.addNode('os4', 'external', 'Local Notification Service', 1110, 610, 210, 64)
    d.addNode('os6', 'external', 'Device OS / File Picker', 1110, 990, 210, 64)
    d.addNode('p1', 'process', 'Profile & Settings', 310, 60, 190, 82, '1.0')
    d.addNode('p2', 'process', 'Academic Planning & Attendance', 310, 230, 220, 92, '2.0')
    d.addNode('p3', 'process', 'Assignments & Competitions', 310, 410, 220, 92, '3.0')
    d.addNode('p4', 'process', 'Reminders, Alerts & Notifications', 310, 600, 230, 92, '4.0')
    d.addNode('p5', 'process', 'Expense & Income Tracking', 310, 790, 210, 92, '5.0')
    d.addNode('p6', 'process', 'Backup, Restore & Reset', 310, 980, 210, 92, '6.0')
    d.addNode('d1', 'store', 'User Profile & Settings', 760, 50, 220, 62, 'D1')
    d.addNode('d2', 'store', 'Subjects & Timetable Versions', 760, 190, 240, 62, 'D2')
    d.addNode('d3', 'store', 'Attendance Records', 760, 310, 210, 62, 'D3')
    d.addNode('d4', 'store', 'Assignments, Competitions & Files', 760, 450, 260, 62, 'D4')
    d.addNode('d5', 'store', 'Reminders, Alerts & Schedules', 760, 610, 250, 62, 'D5')
    d.addNode('d6', 'store', 'Transactions & Categories', 760, 790, 230, 62, 'D6')
    d.addNode('d7', 'store', 'SQLite DB & Private Attachments', 760, 980, 250, 62, 'D7')
    d.addFlow('user1', 'p1', 'profile and preference changes')
    d.addFlow('p1', 'd1', 'validated profile/settings')
    d.addFlow('d1', 'p1', 'current profile/settings')
    d.addFlow('user2', 'p2', 'timetable and attendance input')
    d.addFlow('p2', 'd2', 'subjects, versions and slots')
    d.addFlow('d2', 'p2', 'active schedule')
    d.addFlow('p2', 'd3', 'attendance status')
    d.addFlow('d3', 'p2', 'attendance history')
    d.addFlow('user3', 'p3', 'assignment / competition details')
    d.addFlow('p3', 'd4', 'tasks, rounds, certificates, attachments')
    d.addFlow('d4', 'p3', 'task and event records')
    d.addFlow('user4', 'p4', 'reminder and alert actions')
    d.addFlow('p4', 'd5', 'reminders, alerts, schedule metadata')
    d.addFlow('d5', 'p4', 'due reminders and unread alerts')
    d.addFlow('p4', 'os4', 'local notification requests')
    d.addFlow('user5', 'p5', 'income / expense entries')
    d.addFlow('p5', 'd6', 'categorized transactions')
    d.addFlow('d6', 'p5', 'monthly totals and history')
    d.addFlow('user6', 'p6', 'export / restore / reset request')
    d.addFlow('os6', 'p6', 'selected backup archive')
    d.addFlow('p6', 'd7', 'validated database and files')
    d.addFlow('d7', 'p6', 'database bytes and attachments')
    d.addFlow('p6', 'os6', 'backup ZIP / share sheet')
    d.addFlow('p2', 'user2', 'schedule and attendance analytics')
    d.addFlow('p3', 'user3', 'deadlines and competition progress')
    d.addFlow('p5', 'user5', 'expense summary and category report')
  }

  // Level 2: detailed academic/productivity pipeline
  {
    const d = createDiagram('DFD Level 2 - Academic & Productivity Detail', 'Detailed decomposition of timetable ingestion, attendance, assignments, competitions, and notification scheduling.')
    d.addNode('scanner', 'external', 'Timetable Scanner / File Picker', 30, 70, 220, 64)
    d.addNode('user21', 'external', 'Student / App User', 30, 190, 170, 64)
    d.addNode('user23', 'external', 'Student / App User', 30, 350, 170, 64)
    d.addNode('user24', 'external', 'Student / App User', 30, 490, 170, 64)
    d.addNode('user25', 'external', 'Student / App User', 30, 630, 170, 64)
    d.addNode('user26', 'external', 'Student / App User', 30, 770, 170, 64)
    d.addNode('user27', 'external', 'Student / App User', 30, 910, 170, 64)
    d.addNode('notify', 'external', 'Local Notification Service', 30, 1050, 210, 64)
    d.addNode('user28', 'external', 'Student / App User', 30, 1190, 170, 64)
    d.addNode('p21', 'process', 'Import & Validate Timetable', 330, 70, 210, 82, '2.1')
    d.addNode('p22', 'process', 'Version & Activate Timetable', 330, 210, 210, 82, '2.2')
    d.addNode('p23', 'process', 'Build Daily Schedule', 330, 350, 200, 82, '2.3')
    d.addNode('p24', 'process', 'Record Attendance', 330, 490, 190, 82, '2.4')
    d.addNode('p25', 'process', 'Calculate Attendance Analytics', 330, 630, 220, 82, '2.5')
    d.addNode('p26', 'process', 'Manage Assignments & Attachments', 330, 770, 230, 82, '2.6')
    d.addNode('p27', 'process', 'Manage Competitions & Rounds', 330, 910, 220, 82, '2.7')
    d.addNode('p28', 'process', 'Reconcile Notification Schedule', 330, 1050, 230, 82, '2.8')
    d.addNode('d2', 'store', 'Subjects, Timetable Versions & Slots', 800, 170, 270, 62, 'D2')
    d.addNode('d3', 'store', 'Attendance Records', 800, 500, 210, 62, 'D3')
    d.addNode('d4a', 'store', 'Assignments & Assignment Files', 800, 730, 240, 62, 'D4a')
    d.addNode('d4b', 'store', 'Competitions, Rounds & Certificates', 800, 880, 270, 62, 'D4b')
    d.addNode('d5', 'store', 'Alerts & Notification Schedules', 800, 1040, 250, 62, 'D5')
    d.addNode('d7', 'store', 'Private Attachment Storage', 800, 1190, 230, 62, 'D7')
    d.addFlow('scanner', 'p21', 'image / PDF timetable content')
    d.addFlow('user21', 'p21', 'manual corrections and lab group')
    d.addFlow('p21', 'p22', 'normalized subjects and slots')
    d.addFlow('p22', 'd2', 'new active version and bounded old version')
    d.addFlow('d2', 'p23', 'active slots for selected date')
    d.addFlow('p23', 'user23', 'ordered daily schedule')
    d.addFlow('user24', 'p24', 'present / absent / cancelled / changed')
    d.addFlow('d2', 'p24', 'scheduled subject and timetable version')
    d.addFlow('p24', 'd3', 'validated attendance record')
    d.addFlow('d3', 'p25', 'attendance history by subject')
    d.addFlow('d2', 'p25', 'subject roster and threshold')
    d.addFlow('p25', 'user25', 'percentage, safe bunks and shortage risk')
    d.addFlow('user26', 'p26', 'assignment, deadline, notes and files')
    d.addFlow('p26', 'd4a', 'assignment metadata and file references')
    d.addFlow('p26', 'd7', 'copied private attachments')
    d.addFlow('user27', 'p27', 'competition, team, rounds and certificate')
    d.addFlow('p27', 'd4b', 'competition progress and certificate reference')
    d.addFlow('p27', 'd7', 'copied certificate file')
    d.addFlow('d4a', 'p28', 'pending assignment deadlines')
    d.addFlow('d4b', 'p28', 'upcoming competition rounds')
    d.addFlow('p28', 'd5', 'notification IDs and scheduled times')
    d.addFlow('p28', 'notify', 'schedule / cancel commands')
    d.addFlow('notify', 'user28', 'assignment and competition reminders')
  }
}

function createErdModel() {
  const modelId = id()
  const model = {
    _type: 'ERDDataModel', _id: modelId, _parent: ref(projectId), name: 'Relational Data Model',
    documentation: 'SQLite schema version 5 used by the app. Dates are local YYYY-MM-DD; money is stored in integer cents.', ownedElements: [],
  }
  project.ownedElements.push(model)
  const diagramId = id()
  const diagram = {
    _type: 'ERDDiagram', _id: diagramId, _parent: ref(modelId), name: 'ER Diagram - SQLite Schema v5',
    documentation: 'Complete logical ER diagram for the implemented local database.', visible: true, ownedViews: [],
  }
  model.ownedElements.push(diagram)
  const entities = new Map()
  const relationshipEdges = new Set()
  const relationshipPorts = new Map()

  function addEntity(name, columns, x, y, w = 260) {
    const entityId = id()
    const entity = { _type: 'ERDEntity', _id: entityId, _parent: ref(modelId), name, ownedElements: [], columns: [] }
    const pkMap = new Map()
    for (const col of columns) {
      const column = {
        _type: 'ERDColumn', _id: id(), _parent: ref(entityId), name: col.name, type: col.type,
        ...(col.length ? { length: String(col.length) } : { length: 0 }),
        ...(col.pk ? { primaryKey: true } : {}), ...(col.fk ? { foreignKey: true } : {}),
        ...(col.nullable ? { nullable: true } : {}), ...(col.unique ? { unique: true } : {}),
      }
      entity.columns.push(column)
      pkMap.set(col.name, column)
    }
    model.ownedElements.push(entity)
    const viewId = id()
    const title = label(viewId, name.toUpperCase(), x, y + 5, w, { bold: true })
    const compartmentId = id()
    const columnViews = entity.columns.map((column, index) => ({
      _type: 'ERDColumnView', _id: id(), _parent: ref(compartmentId), model: ref(column._id),
      font: 'Arial;12;0', fontColor: '#111827', left: x + 5, top: y + 32 + index * 15, width: w - 10, height: 14,
    }))
    const height = 38 + entity.columns.length * 15
    const compartment = {
      _type: 'ERDColumnCompartmentView', _id: compartmentId, _parent: ref(viewId), model: ref(entityId),
      subViews: columnViews, font: 'Arial;12;0', left: x, top: y + 27, width: w, height: height - 27,
    }
    const view = {
      _type: 'ERDEntityView', _id: viewId, _parent: ref(diagramId), model: ref(entityId), subViews: [title, compartment],
      font: 'Arial;12;0', lineColor: '#1E3A8A', fillColor: '#EFF6FF', fontColor: '#111827', showShadow: true,
      left: x, top: y, width: w, height, nameLabel: ref(title._id), columnCompartment: ref(compartmentId),
    }
    diagram.ownedViews.push(view)
    entities.set(name, { entity, view, columns: pkMap, x, y, w, height })
  }

  const C = (name, type = 'TEXT', opts = {}) => ({ name, type, ...opts })
  addEntity('users', [C('id','TEXT',{pk:true}),C('name'),C('phone'),C('gender'),C('gmail'),C('college'),C('course'),C('semester'),C('section'),C('year_of_entry'),C('expected_year_of_passing'),C('avatar','TEXT',{nullable:true}),C('onboarding_complete','INTEGER'),C('created_at'),C('updated_at')], 610, 30, 285)
  addEntity('user_settings', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true,unique:true}),C('theme'),C('attendance_threshold','REAL'),C('attendance_notifications_enabled','INTEGER'),C('assignment_notifications_enabled','INTEGER'),C('competition_notifications_enabled','INTEGER'),C('reminder_notifications_enabled','INTEGER'),C('timezone'),C('created_at'),C('updated_at')], 930, 30, 310)
  addEntity('subjects', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('name'),C('short_name'),C('color'),C('created_at'),C('updated_at')], 290, 300, 260)
  addEntity('timetable_versions', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('active_from'),C('active_to','TEXT',{nullable:true}),C('created_at')], 20, 530, 250)
  addEntity('timetable_slots', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('timetable_version_id','TEXT',{fk:true}),C('subject_id','TEXT',{fk:true}),C('day_of_week','INTEGER'),C('period','INTEGER'),C('start_time'),C('end_time'),C('active_from'),C('active_to','TEXT',{nullable:true}),C('room','TEXT',{nullable:true}),C('teacher','TEXT',{nullable:true}),C('lab_group','INTEGER',{nullable:true}),C('created_at'),C('updated_at')], 290, 510, 295)
  addEntity('attendance_records', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('date'),C('subject_id','TEXT',{fk:true}),C('status'),C('changed_to_subject_id','TEXT',{fk:true,nullable:true}),C('timetable_version_id','TEXT',{fk:true,nullable:true}),C('created_at'),C('updated_at')], 610, 520, 305)
  addEntity('assignments', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('name'),C('subject_id','TEXT',{fk:true}),C('deadline'),C('status'),C('completed_at','TEXT',{nullable:true}),C('notes'),C('created_at'),C('updated_at')], 20, 850, 260)
  addEntity('assignment_files', [C('id','TEXT',{pk:true}),C('assignment_id','TEXT',{fk:true}),C('original_name'),C('local_path','TEXT',{unique:true}),C('mime_type'),C('file_size','INTEGER'),C('created_at')], 320, 870, 280)
  addEntity('competitions', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('name'),C('team_name'),C('type'),C('custom_type','TEXT',{nullable:true}),C('status'),C('celebration_shown','INTEGER'),C('created_at'),C('updated_at')], 640, 850, 280)
  addEntity('competition_rounds', [C('id','TEXT',{pk:true}),C('competition_id','TEXT',{fk:true}),C('label'),C('date'),C('status'),C('created_at'),C('updated_at')], 960, 850, 280)
  addEntity('competition_files', [C('id','TEXT',{pk:true}),C('competition_id','TEXT',{fk:true}),C('original_name'),C('local_path','TEXT',{unique:true}),C('mime_type'),C('file_size','INTEGER'),C('created_at')], 1280, 850, 280)
  addEntity('reminders', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('message'),C('date'),C('time'),C('frequency'),C('enabled','INTEGER'),C('last_triggered_at','TEXT',{nullable:true}),C('created_at'),C('updated_at')], 20, 1190, 275)
  addEntity('categories', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('name'),C('icon'),C('type'),C('color'),C('is_default','INTEGER'),C('created_at'),C('updated_at')], 340, 1190, 260)
  addEntity('transactions', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('type'),C('category_id','TEXT',{fk:true}),C('amount_cents','INTEGER'),C('account'),C('date'),C('comment'),C('created_at'),C('updated_at')], 640, 1190, 275)
  addEntity('alerts', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('title'),C('message'),C('timestamp'),C('read','INTEGER'),C('alert_type'),C('reference_type','TEXT',{nullable:true}),C('reference_id','TEXT',{nullable:true}),C('dedupe_key','TEXT',{nullable:true}),C('created_at')], 960, 1190, 280)
  addEntity('notification_schedules', [C('id','TEXT',{pk:true}),C('user_id','TEXT',{fk:true}),C('entity_type'),C('entity_id'),C('notification_id','INTEGER'),C('scheduled_for'),C('created_at')], 1280, 1190, 285)

  function relate(sourceName, targetName, fkColumn, name = 'has', sourceCard = '1', targetCard = '0..*') {
    const source = entities.get(sourceName)
    const target = entities.get(targetName)
    const relId = id()
    const end1Id = id(), end2Id = id()
    const relationship = {
      _type: 'ERDRelationship', _id: relId, _parent: ref(source.entity._id), name,
      end1: { _type: 'ERDRelationshipEnd', _id: end1Id, _parent: ref(relId), reference: ref(source.entity._id), cardinality: sourceCard },
      end2: { _type: 'ERDRelationshipEnd', _id: end2Id, _parent: ref(relId), reference: ref(target.entity._id), cardinality: targetCard },
    }
    source.entity.ownedElements.push(relationship)
    const targetFk = target.columns.get(fkColumn)
    const sourcePk = source.columns.get('id')
    if (targetFk && sourcePk) targetFk.referenceTo = ref(sourcePk._id)
    const viewId = id()
    const nameLabel = label(viewId, name, 0, 0, Math.max(45, name.length * 7), { edge: true, modelId: relId })
    const tailLabel = label(viewId, sourceCard, 0, 0, 35, { edge: true, edgePosition: 2 })
    const headLabel = label(viewId, targetCard, 0, 0, 40, { edge: true })
    nameLabel.visible = false
    tailLabel.visible = false
    headLabel.visible = false
    const route = orthogonalRoute([...entities.values()], source, target, relationshipEdges, relationshipPorts)
    diagram.ownedViews.push({
      _type: 'ERDRelationshipView', _id: viewId, _parent: ref(diagramId), model: ref(relId),
      subViews: [nameLabel, tailLabel, headLabel], font: 'Arial;11;0', lineColor: '#475569',
      head: ref(target.view._id), tail: ref(source.view._id), lineStyle: 2,
      points: route.map(p => `${Math.round(p.x)}:${Math.round(p.y)}`).join(';'),
      nameLabel: ref(nameLabel._id), tailNameLabel: ref(tailLabel._id), headNameLabel: ref(headLabel._id),
    })
  }

  relate('users','user_settings','user_id','configures','1','0..1')
  relate('users','subjects','user_id','owns')
  relate('users','timetable_versions','user_id','owns')
  relate('users','timetable_slots','user_id','owns')
  relate('timetable_versions','timetable_slots','timetable_version_id','contains')
  relate('subjects','timetable_slots','subject_id','scheduled in')
  relate('users','attendance_records','user_id','records')
  relate('subjects','attendance_records','subject_id','attended as')
  relate('subjects','attendance_records','changed_to_subject_id','changed to','0..1','0..*')
  relate('timetable_versions','attendance_records','timetable_version_id','context for')
  relate('users','assignments','user_id','owns')
  relate('subjects','assignments','subject_id','has')
  relate('assignments','assignment_files','assignment_id','attaches')
  relate('users','competitions','user_id','tracks')
  relate('competitions','competition_rounds','competition_id','contains')
  relate('competitions','competition_files','competition_id','certifies')
  relate('users','reminders','user_id','creates')
  relate('users','categories','user_id','owns')
  relate('users','transactions','user_id','records')
  relate('categories','transactions','category_id','classifies')
  relate('users','alerts','user_id','receives')
  relate('users','notification_schedules','user_id','schedules')
}

createDfdModel()
createErdModel()
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(project, null, 2) + '\n')
console.log(outPath)
