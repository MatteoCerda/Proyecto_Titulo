export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  rut?: string;
  claimCode?: string;
  nombre_contacto?: string;
  telefono?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  canalRegistro?: 'web' | 'presencial' | 'wsp';
}
export interface LoginDTO { email: string; password: string }
export interface JwtPayload { sub: number; email: string; role: string }
