import { Injectable, signal } from '@angular/core';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'auth.token';
  private roleKey = 'auth.role';
  private emailKey = 'auth.email';

  user = signal<{ email: string; role: UserRole } | null>(null);

  // Simulación de login
  async login(email: string, password: string) {
    let role: UserRole = 'CLIENT';
    if (email.includes('admin')) role = 'ADMIN';
    else if (email.includes('op')) role = 'OPERATOR';

    localStorage.setItem(this.tokenKey, 'fake-token');
    localStorage.setItem(this.roleKey, role);
    localStorage.setItem(this.emailKey, email);

    this.user.set({ email, role });
    return true;
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
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
