import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT';
type UserInfo = { email: string; role: UserRole; fullName?: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'auth.token';
  private roleKey = 'auth.role';
  private emailKey = 'auth.email';
  private api = 'http://localhost:3000';

  user = signal<UserInfo | null>(null);

  constructor(private http: HttpClient) {}

  async login(email: string, password: string) {
    const res = await firstValueFrom(this.http.post<{ token: string; user: { email: string; role: string; fullName?: string } }>(`${this.api}/auth/login`, { email, password }));
    const roleMap: Record<string, UserRole> = { ADMIN: 'ADMIN', admin: 'ADMIN', OPERATOR: 'OPERATOR', operator: 'OPERATOR', USER: 'CLIENT', user: 'CLIENT' };
    const role: UserRole = roleMap[res.user?.role] || 'CLIENT';
    localStorage.setItem(this.tokenKey, res.token);
    // Mantener compatibilidad con otros interceptores
    localStorage.setItem('ks_token', res.token);
    localStorage.setItem(this.roleKey, role);
    localStorage.setItem(this.emailKey, res.user?.email || email);
    this.user.set({ email: res.user?.email || email, role, fullName: res.user?.fullName });
    return true;
  }

  async getMe() {
    const res = await firstValueFrom(this.http.get<{ user: { email: string; role: string; fullName?: string } }>(`${this.api}/me`));
    const roleMap: Record<string, UserRole> = { ADMIN: 'ADMIN', admin: 'ADMIN', OPERATOR: 'OPERATOR', operator: 'OPERATOR', USER: 'CLIENT', user: 'CLIENT' };
    const role: UserRole = roleMap[res.user?.role] || 'CLIENT';
    const email = res.user?.email || this.getEmail();
    this.user.set({ email, role, fullName: res.user?.fullName });
    return this.user();
  }

  async updateProfile(fullName: string) {
    const res = await firstValueFrom(this.http.put<{ user: { email: string; role: string; fullName?: string } }>(`${this.api}/me`, { fullName }));
    const roleMap: Record<string, UserRole> = { ADMIN: 'ADMIN', admin: 'ADMIN', OPERATOR: 'OPERATOR', operator: 'OPERATOR', USER: 'CLIENT', user: 'CLIENT' };
    const role: UserRole = roleMap[res.user?.role] || 'CLIENT';
    const email = res.user?.email || this.getEmail();
    this.user.set({ email, role, fullName: res.user?.fullName });
    return this.user();
  }

  async updatePassword(currentPassword: string, newPassword: string) {
    await firstValueFrom(this.http.put<{ ok: boolean }>(`${this.api}/me/password`, { currentPassword, newPassword }));
    return true;
  }

  async getClientProfile() {
    const res = await firstValueFrom(this.http.get<{ profile: any }>(`${this.api}/me/profile`));
    return res.profile || null;
  }

  async updateClientProfile(data: { rut?: string; nombre_contacto?: string; telefono?: string; direccion?: string; comuna?: string; ciudad?: string; }) {
    const res = await firstValueFrom(this.http.put<{ profile: any }>(`${this.api}/me/profile`, data));
    return res.profile;
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem('ks_token');
    localStorage.removeItem(this.roleKey);
    localStorage.removeItem(this.emailKey);
    this.user.set(null);
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }

  getRole(): UserRole {
    return (localStorage.getItem(this.roleKey) as UserRole) || 'CLIENT';
  }

  getEmail(): string {
    return localStorage.getItem(this.emailKey) || '';
  }

  hasRole(role: UserRole | UserRole[]): boolean {
    const current = this.getRole();
    if (Array.isArray(role)) {
      return role.includes(current);
    }
    return current === role;
  }
}
