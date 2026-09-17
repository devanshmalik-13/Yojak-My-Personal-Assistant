import type { AppState, FileAttachment, UserProfile } from "../types";
import { getDatabase } from "../database/database";
import { userRepository } from "../repositories/userRepository";
import { settingsRepository, DEFAULT_SETTINGS } from "../repositories/settingsRepository";
import { subjectRepository } from "../repositories/subjectRepository";
import { timetableRepository } from "../repositories/timetableRepository";
import { attendanceRepository } from "../repositories/attendanceRepository";
import { assignmentService } from "./assignmentService";
import { competitionRepository } from "../repositories/competitionRepository";
import { reminderRepository } from "../repositories/reminderRepository";
import { transactionRepository } from "../repositories/transactionRepository";
import { categoryRepository } from "../repositories/categoryRepository";
import { alertRepository } from "../repositories/alertRepository";
import { localFileService } from "./fileService";
import { notificationService } from "./notificationService";
import { alertService } from "./alertService";

const EMPTY_PROFILE:UserProfile={name:"",phone:"",gender:"prefer_not_to_say",gmail:"",avatar:null,avatarLocalPath:null,college:"",course:"",semester:"1st",section:"A",yearOfEntry:String(new Date().getFullYear()),expectedYearOfPassing:String(new Date().getFullYear()+4)};

export function createEmptyState():AppState{return{onboardingComplete:false,profile:{...EMPTY_PROFILE},theme:DEFAULT_SETTINGS.theme,notificationSettings:{...DEFAULT_SETTINGS.notificationSettings},timezone:DEFAULT_SETTINGS.timezone,subjects:[],timetable:[],timetableSetup:false,timetableActiveFrom:"",timetableActiveTo:"",attendanceThreshold:DEFAULT_SETTINGS.attendanceThreshold,attendanceRecords:[],assignments:[],competitions:[],reminders:[],transactions:[],categories:[],alerts:[]};}

async function hydrateStateFiles(state:AppState):Promise<AppState>{const profile={...state.profile};if(profile.avatar){profile.avatarLocalPath=profile.avatar;profile.avatar=await localFileService.getDisplayUrl(profile.avatar);}const hydrateFile=async(f:FileAttachment)=>({...f,url:f.localPath?await localFileService.getDisplayUrl(f.localPath):f.url});const assignments=await Promise.all(state.assignments.map(async a=>({...a,files:await Promise.all(a.files.map(hydrateFile))})));const competitions=await Promise.all(state.competitions.map(async c=>({...c,documents:await Promise.all((c.documents??[]).map(hydrateFile)),certificate:c.certificate?await hydrateFile(c.certificate):undefined})));return{...state,profile,assignments,competitions};}

export const applicationService={
  async initialize():Promise<AppState>{await getDatabase();const user=await userRepository.get();if(!user)return createEmptyState();await settingsRepository.ensure(user.id);await categoryRepository.ensureDefaults(user.id);let state=await this.load();await alertService.reconcile(state);state=await this.load();void notificationService.reconcileApp(state).catch(()=>undefined);return state;},
  async load():Promise<AppState>{const user=await userRepository.get();if(!user)return createEmptyState();const [settings,allSubjects,timetable,attendanceRecords,assignments,competitions,reminders,transactions,categories,alerts]=await Promise.all([settingsRepository.get(),subjectRepository.getAll(),timetableRepository.getActive(),attendanceRepository.getAll(),assignmentService.getAll(),competitionRepository.getAll(),reminderRepository.getAll(),transactionRepository.getAll(),categoryRepository.getAll(),alertRepository.getAll()]);const activeSubjectIds=new Set(timetable.slots.map(slot=>slot.subjectId));const subjects=allSubjects.filter(subject=>activeSubjectIds.has(subject.id));return hydrateStateFiles({onboardingComplete:user.onboardingComplete,profile:user.profile,theme:settings.theme,notificationSettings:settings.notificationSettings,timezone:settings.timezone,subjects,timetable:timetable.slots,timetableSetup:timetable.slots.length>0,timetableActiveFrom:timetable.activeFrom,timetableActiveTo:timetable.activeTo,attendanceThreshold:settings.attendanceThreshold,attendanceRecords,assignments,competitions,reminders,transactions,categories,alerts});},
};
