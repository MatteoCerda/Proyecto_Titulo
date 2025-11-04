import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT';
type UserInfo = { email: string; role: UserRole; fullName?: string };
type LoginScope = 'client' | 'admin' | 'operator';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'auth.token';
  private readonly roleKey = 'auth.role';
  private readonly emailKey = 'auth.email';
  private readonly apiBase = (environment.apiUrl || '').replace(/\/$/, '');

  user = signal<UserInfo | null>(null);

  constructor(private http: HttpClient) {}

  private endpoint(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (this.apiBase) {
      return `${this.apiBase}${normalized}`;
    }
    if (normalized.startsWith('/api/')) {
      return normalized;
    }
    const firstSegment = normalized.split('/')[1] || '';
    const passthroughSegments = new Set(['auth', 'catalogo']);
    if (passthroughSegments.has(firstSegment)) {
      return normalized;
    }
    return `/api${normalized}`;
  }

  private mapRole(role?: string | null): UserRole {
    if (!role) return 'CLIENT';
    const normalized = role.toString().toUpperCase();
    if (normalized === 'ADMIN') return 'ADMIN';
    if (normalized === 'OPERATOR') return 'OPERATOR';
    return 'CLIENT';
  }

  private persistSession(token: string, role: UserRole, email: string, fullName?: string) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem('ks_token', token);
    localStorage.setItem(this.roleKey, role);
    localStorage.setItem(this.emailKey, email);
    this.user.set({ email, role, fullName });
  }

  async login(email: string, password: string, scope: LoginScope = 'client') {
    const endpoints: Record<LoginScope, string> = {
      client: '/auth/login',
      admin: '/auth/login/admin',
      operator: '/auth/login/operator'
    };
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: { email: string; role: string; fullName?: string } }>(
        this.endpoint(endpoints[scope]),
        { email, password }
      )
    );
    const role = this.mapRole(res.user?.role);
    const resolvedEmail = res.user?.email || email;
    this.persistSession(res.token, role, resolvedEmail, res.user?.fullName);
    return true;
  }

  loginClient(email: string, password: string) {
    return this.login(email, password, 'client');
  }

  loginAdmin(email: string, password: string) {
    return this.login(email, password, 'admin');
  }

  loginOperator(email: string, password: string) {
    return this.login(email, password, 'operator');
  }

  async register(
    fullName: string,
    email: string,
    password: string,
    extra?: Record<string, unknown>
  ): Promise<void> {
    const payload = {
      fullName,
      email,
      password,
      canalRegistro: 'web',
      ...(extra || {})
    };
    await firstValueFrom(this.http.post(this.endpoint('/auth/register'), payload));
  }

  async ensureMe() {
    if (!this.isAuthenticated()) return null;
    if (!this.user() || !this.user()!.email) {
      try {
        return await this.getMe();
      } catch {
        return null;
      }
    }
    return this.user();
  }

  displayName(): string {
    const u = this.user();
    if (u?.fullName && u.fullName.trim().length > 0) return u.fullName;
    const email = u?.email || this.getEmail();
    return email ? (email.split('@')[0] || email) : '';
  }

  async getMe() {
    const res = await firstValueFrom(
      this.http.get<{ user: { email: string; role: string; fullName?: string } }>(
        this.endpoint('/api/me')
      )
    );
    const role = this.mapRole(res.user?.role);
    const email = res.user?.email || this.getEmail();
    this.user.set({ email, role, fullName: res.user?.fullName });
    return this.user();
  }

  async updateProfile(fullName: string) {
    const res = await firstValueFrom(
      this.http.put<{ user: { email: string; role: string; fullName?: string } }>(
        this.endpoint('/api/me'),
        { fullName }
      )
    );
    const role = this.mapRole(res.user?.role);
    const email = res.user?.email || this.getEmail();
    this.user.set({ email, role, fullName: res.user?.fullName });
    return this.user();
  }

  async updatePassword(currentPassword: string, newPassword: string) {
    await firstValueFrom(
      this.http.put<{ ok: boolean }>(this.endpoint('/api/me/password'), {
        currentPassword,
        newPassword
      })
    );
    return true;
  }

  async getClientProfile() {
    const res = await firstValueFrom(
      this.http.get<{ profile: any }>(this.endpoint('/api/me/profile'))
    );
    return res.profile || null;
  }

  async updateClientProfile(data: {
    rut?: string;
    nombre_contacto?: string;
    telefono?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
  }) {
    const res = await firstValueFrom(
      this.http.put<{ profile: any }>(this.endpoint('/api/me/profile'), data)
    );
    return res.profile;
  }

  async forgotPassword(email: string): Promise<{ ok: boolean; token?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; token?: string }>(this.endpoint('/auth/forgot'), { email })
    );
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
