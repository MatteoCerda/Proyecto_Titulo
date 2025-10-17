import { Routes } from '@angular/router';
import { KingstoneLayoutComponent } from './layouts/kingstone-layout.component';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  // Público/cliente bajo el layout general
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
      { path: 'crea-tu-diseno', canMatch: [authGuard], loadComponent: () => import('./pages/cliente/nuevo-pedido.page').then(m => m.NuevoPedidoPage) },
      { path: 'redir', loadComponent: () => import('./pages/role-redirect/role-redirect.page').then(m => m.RoleRedirectPage) },
      { path: 'cliente', loadComponent: () => import('./pages/cliente/mis-pedidos.page').then(m => m.MisPedidosPage) },
      { path: 'operador', loadComponent: () => import('./pages/operador/dashboard.page').then(m => m.OperatorDashboardPage) },
    ]
  },
  // Área de administración con su propio layout y header
      {
        path: 'admin',
        canMatch: [roleGuard('ADMIN')],
        loadComponent: () => import('./layouts/admin-layout.component').then(m => m.AdminLayoutComponent),
        children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', loadComponent: () => import('./pages/admin/dashboard.page').then(m => m.DashboardPage) },
          { path: 'usuarios', loadComponent: () => import('./pages/admin/usuarios-roles.page').then(m => m.AdminUsuariosRolesPage) },
          { path: 'usuarios/:id', loadComponent: () => import('./pages/admin/user-detail.page').then(m => m.AdminUserDetailPage) },
      { path: 'catalogo', loadComponent: () => import('./pages/admin/catalogo-precio.page').then(m => m.AdminCatalogoPrecioPage) },
      { path: 'catalogo/:id', loadComponent: () => import('./pages/admin/catalogo-precio-detalle.page').then(m => m.AdminCatalogoPrecioDetallePage) },
          { path: 'reportes', loadComponent: () => import('./pages/admin/reportes.page').then(m => m.AdminReportesPage) },
          { path: 'reportes/distribucion', loadComponent: () => import('./pages/admin/reportes-detalle-torta.page').then(m => m.AdminReporteTortaPage) },
          { path: 'reportes/top-clientes', loadComponent: () => import('./pages/admin/reportes-detalle-barras.page').then(m => m.AdminReporteBarrasPage) },
          { path: 'reportes/ventas-mensuales', loadComponent: () => import('./pages/admin/reportes-detalle-lineas.page').then(m => m.AdminReporteLineasPage) },
      { path: 'stock', loadComponent: () => import('./pages/admin/stock.page').then(m => m.AdminStockPage) },
      { path: 'perfil', loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) },
    ]
  }
];
