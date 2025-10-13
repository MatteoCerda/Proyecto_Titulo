import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = 'http://localhost:3000';
  private tokenKey = 'ks_token';

  constructor(private http: HttpClient) {}

  login(email: string, password: string) {
    return this.http.post<{ token: string }>(`${this.api}/auth/login`, { email, password })
      .pipe(tap(res => { localStorage.setItem(this.tokenKey, res.token); localStorage.setItem('auth.token', res.token); }));
  }

  register(fullName: string, email: string, password: string) {
    return this.http.post(`${this.api}/auth/register`, { fullName, email, password });
  }

  get token() { return localStorage.getItem(this.tokenKey); }
  logout() { localStorage.removeItem(this.tokenKey); }
  isAuthenticated() { return !!this.token; }
}
