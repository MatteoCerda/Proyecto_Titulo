import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },

  // PÚBLICA
  { path: 'inicio', loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage) },

  // LOGIN
  { path: 'login', loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },

  // REDIRECCIÓN POST LOGIN
  { path: 'redir', loadComponent: () => import('./pages/role-redirect/role-redirect.page').then(m => m.RoleRedirectPage) },

  // 403
  { path: 'forbidden', loadComponent: () => import('./pages/forbidden/forbidden.page').then(m => m.ForbiddenPage) },

  // ...admin/cliente protegidas
];
