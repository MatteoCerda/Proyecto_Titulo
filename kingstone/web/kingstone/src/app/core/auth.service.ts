import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private tokenKey = 'auth.token';
  private roleKey  = 'auth.role';

  async login(email: string, password: string) {
    const data = await this.http.post<{token:string, role:UserRole, email:string}>(
      '/auth/login', { email, password }
    ).toPromise();
    if (data) {
      localStorage.setItem(this.tokenKey, data.token);
      localStorage.setItem(this.roleKey, data.role);
    }
    return data;
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.roleKey);
  }

  get token() { return localStorage.getItem(this.tokenKey); }
  get role(): UserRole | null { return localStorage.getItem(this.roleKey) as UserRole | null; }
  isAuthenticated() { return !!this.token; }
  hasRole(roles: UserRole[]) { return this.role ? roles.includes(this.role) : false; }
}
