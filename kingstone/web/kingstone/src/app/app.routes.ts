import { Routes } from '@angular/router';
import { KingstoneLayoutComponent } from './layouts/kingstone-layout.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: KingstoneLayoutComponent,
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage) },
      { path: 'login', loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },
      { path: 'recuperar', loadComponent: () => import('./pages/forgot/forgot-password.page').then(m => m.ForgotPasswordPage) },
      { path: 'registro', loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage) },
      { path: 'perfil', canMatch: [authGuard], loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) },
      { path: 'admin', loadComponent: () => import('./pages/admin/dashboard.page').then(m => m.DashboardPage) },
      { path: 'cliente', loadComponent: () => import('./pages/cliente/mis-pedidos.page').then(m => m.MisPedidosPage) },
      { path: 'operador', loadComponent: () => import('./pages/operador/dashboard.page').then(m => m.OperatorDashboardPage) },
    ]
  }
];
