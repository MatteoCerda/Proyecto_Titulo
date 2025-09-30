export interface RegisterDTO { email: string; password: string; fullName: string }
export interface LoginDTO { email: string; password: string }
export interface JwtPayload { sub: number; email: string; role: string }
