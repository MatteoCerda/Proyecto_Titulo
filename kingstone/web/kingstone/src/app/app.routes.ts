import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'redir', pathMatch: 'full' },

  { path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },

  { path: 'redir',
    loadComponent: () => import('./pages/role-redirect/role-redirect.page').then(m => m.RoleRedirectPage) },

  { path: 'forbidden',
    loadComponent: () => import('./pages/forbidden/forbidden.page').then(m => m.ForbiddenPage) },

  // ADMIN/OPERADOR
  {
    path: 'admin',
    canMatch: [authGuard, roleGuard(['ADMIN','OPERATOR'])],
    loadComponent: () => import('./layouts/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: 'pedidos',
        loadComponent: () => import('./pages/admin/pedidos.page').then(m => m.PedidosPage) },
      { path: '', pathMatch: 'full', redirectTo: 'pedidos' }
    ]
  },

  // CLIENTE
  {
    path: 'cliente',
    canMatch: [authGuard, roleGuard(['CLIENT'])],
    loadComponent: () => import('./layouts/client-shell.component').then(m => m.ClientShellComponent),
    children: [
      { path: 'mis-pedidos',
        loadComponent: () => import('./pages/cliente/mis-pedidos.page').then(m => m.MisPedidosPage) },
      { path: 'nuevo-pedido',
        loadComponent: () => import('./pages/cliente/nuevo-pedido.page').then(m => m.NuevoPedidoPage) },
      { path: '', pathMatch: 'full', redirectTo: 'mis-pedidos' }
    ]
  },

  { path: '**', redirectTo: 'login' }
];
