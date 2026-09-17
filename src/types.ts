export type ThemeMode = 'light' | 'dark' | 'system'
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'
export type NavTab = 'home' | 'attendance' | 'assignments' | 'competitions' | 'expense'
export type AttendanceStatus = 'present' | 'absent' | 'cancelled' | 'changed' | 'unmarked'
export type AssignmentStatus = 'pending' | 'completed' | 'overdue'
export type CompetitionType = 'hackathon' | 'ctf' | 'sports' | 'other'
export type Frequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type TransactionType = 'expense' | 'income'

export interface UserProfile {
  name: string
  phone: string
  gender: Gender
  gmail: string
  avatar: string | null
  avatarLocalPath?: string | null
  college: string
  course: string
  semester: string
  section: string
  yearOfEntry: string
  expectedYearOfPassing: string
}

export interface Subject {
  id: string
  name: string
  shortName: string
  color: string
}

export interface TimetableSlot {
  id: string
  dayOfWeek: number // 1=Mon … 7=Sun
  period: number
  subjectId: string
  startTime: string
  endTime: string
  room?: string
  teacher?: string
  labGroup?: number
  timetableVersionId?: string
}

export interface AttendanceRecord {
  id: string
  date: string // YYYY-MM-DD
  subjectId: string
  status: AttendanceStatus
  changedToSubjectId?: string
  timetableVersionId?: string
}

export interface Assignment {
  id: string
  name: string
  subjectId: string
  deadline: string // ISO
  status: AssignmentStatus
  completedAt?: string
  files: FileAttachment[]
  notes: string
}

export interface FileAttachment {
  id: string
  name: string
  fileType: string
  url?: string
  localPath?: string
  size?: number
}

export interface CompetitionRound {
  id: string
  label: string
  date: string // YYYY-MM-DD
  status: 'upcoming' | 'completed'
}

export interface Competition {
  id: string
  name: string
  teamName: string
  type: CompetitionType
  customType?: string
  rounds: CompetitionRound[]
  status: 'upcoming' | 'completed'
  celebrationShown: boolean
  documents?: FileAttachment[]
  certificate?: FileAttachment
}

export interface Reminder {
  id: string
  message: string
  date: string // YYYY-MM-DD (for once/weekly/etc.)
  time: string // HH:MM
  frequency: Frequency
  enabled?: boolean
}

export interface Transaction {
  id: string
  type: TransactionType
  categoryId: string
  amount: number
  account: string
  date: string // YYYY-MM-DD
  comment: string
}

export interface Category {
  id: string
  name: string
  icon: string
  type: TransactionType
  color: string
}

export interface AppAlert {
  id: string
  title: string
  message: string
  timestamp: string
  read: boolean
  alertType: 'attendance' | 'assignment' | 'competition' | 'reminder' | 'system'
  referenceType?: string
  referenceId?: string
}

export interface NotificationSettings {
  attendance: boolean
  assignments: boolean
  competitions: boolean
  reminders: boolean
}

export interface AppState {
  onboardingComplete: boolean
  profile: UserProfile
  theme: ThemeMode
  notificationSettings: NotificationSettings
  timezone: string
  subjects: Subject[]
  timetable: TimetableSlot[]
  timetableSetup: boolean
  timetableActiveFrom: string
  timetableActiveTo: string
  attendanceThreshold: number
  attendanceRecords: AttendanceRecord[]
  assignments: Assignment[]
  competitions: Competition[]
  reminders: Reminder[]
  transactions: Transaction[]
  categories: Category[]
  alerts: AppAlert[]
}
