/** Local-first compatibility exports. No network client is used in v1. */
export class ApiError extends Error { constructor(public status:number,message:string){super(message);this.name="ApiError";} }
