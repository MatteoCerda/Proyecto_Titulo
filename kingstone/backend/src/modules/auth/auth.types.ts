export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  rut?: string;
  nombre_contacto?: string;
  telefono?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
}
export interface LoginDTO { email: string; password: string }
export interface JwtPayload { sub: number; email: string; role: string }
