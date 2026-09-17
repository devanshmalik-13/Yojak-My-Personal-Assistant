import type { UserProfile } from "../src/types";
import { profileService } from "../src/services/profileService";
import { subjectRepository } from "../src/repositories/subjectRepository";

export const profile:UserProfile={name:"Asha Rao",phone:"9876543210",gender:"female",gmail:"asha@example.com",avatar:null,college:"Example College",course:"Computer Science",semester:"3rd",section:"A",yearOfEntry:"2024",expectedYearOfPassing:"2028"};
export async function onboard(){await profileService.completeOnboarding(profile);return subjectRepository.create({name:"Database Systems",shortName:"DBMS",color:"#123456"});}
