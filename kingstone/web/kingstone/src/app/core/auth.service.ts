import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'auth.token';
  private roleKey = 'auth.role';
  private emailKey = 'auth.email';
  private api = 'http://localhost:3000';

  user = signal<{ email: string; role: UserRole } | null>(null);

  constructor(private http: HttpClient) {}

  async login(email: string, password: string) {
    const res = await firstValueFrom(this.http.post<{ token: string; user: { email: string; role: string } }>(`${this.api}/auth/login`, { email, password }));
    const roleMap: Record<string, UserRole> = { ADMIN: 'ADMIN', admin: 'ADMIN', OPERATOR: 'OPERATOR', operator: 'OPERATOR', USER: 'CLIENT', user: 'CLIENT' };
    const role: UserRole = roleMap[res.user?.role] || 'CLIENT';
    localStorage.setItem(this.tokenKey, res.token);
    // Mantener compatibilidad con otros interceptores
    localStorage.setItem('ks_token', res.token);
    localStorage.setItem(this.roleKey, role);
    localStorage.setItem(this.emailKey, res.user?.email || email);
    this.user.set({ email: res.user?.email || email, role });
    return true;
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

  hasRole(role: UserRole): boolean {
    return this.getRole() === role;
  }
}
