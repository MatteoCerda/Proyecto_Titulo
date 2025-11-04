import { Routes } from '@angular/router';
import { KingstoneLayoutComponent } from './layouts/kingstone-layout.component';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  // Seccion publica/cliente bajo el layout general
  {
    path: '',
    component: KingstoneLayoutComponent,
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage) },
      { path: 'productos', loadComponent: () => import('./pages/productos/productos.page').then(m => m.ProductosPage) },
      { path: 'carrito', loadComponent: () => import('./pages/carrito/carrito.page').then(m => m.CarritoPage) },
      { path: 'login', loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },
      { path: 'recuperar', loadComponent: () => import('./pages/forgot/forgot-password.page').then(m => m.ForgotPasswordPage) },
      { path: 'registro', loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage) },
      { path: 'perfil', canMatch: [authGuard], loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) },
      { path: 'crea-tu-diseno', canMatch: [authGuard], loadComponent: () => import('./pages/cliente/nuevo-pedido.page').then(m => m.NuevoPedidoPage) },
      { path: 'redir', loadComponent: () => import('./pages/role-redirect/role-redirect.page').then(m => m.RoleRedirectPage) },
      { path: 'cliente', redirectTo: 'cliente/mis-pedidos', pathMatch: 'full' },
      { path: 'cliente/mis-pedidos', canMatch: [authGuard], loadComponent: () => import('./pages/cliente/mis-pedidos.page').then(m => m.MisPedidosPage) },
      { path: 'cliente/metodos-pago', canMatch: [authGuard], loadComponent: () => import('./pages/cliente/metodos-pago.page').then(m => m.MetodosPagoPage) }
    ]
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
    data: { scope: 'admin' }
  },
  // Area de administracion
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
      { path: 'reportes/top-productos', loadComponent: () => import('./pages/admin/reportes-detalle-productos-top.page').then(m => m.AdminReporteProductosTopPage) },
      { path: 'reportes/productos-lentos', loadComponent: () => import('./pages/admin/reportes-detalle-productos-low.page').then(m => m.AdminReporteProductosLowPage) },
      { path: 'reportes/embudo-pagos', loadComponent: () => import('./pages/admin/reportes-detalle-funnel.page').then(m => m.AdminReporteFunnelPage) },
      { path: 'ofertas', loadComponent: () => import('./pages/admin/ofertas.page').then(m => m.AdminOfertasPage) },
      { path: 'stock', loadComponent: () => import('./pages/admin/stock.page').then(m => m.AdminStockPage) },
      { path: 'perfil', loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) }
    ]
  },
  {
    path: 'operador/login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
    data: { scope: 'operator' }
  },
  // Panel del operador
  {
    path: 'operador',
    canMatch: [roleGuard('OPERATOR')],
    loadComponent: () => import('./layouts/operator-shell.component').then(m => m.OperatorShellComponent),
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', loadComponent: () => import('./pages/operador/dashboard.page').then(m => m.OperatorDashboardPage) },
      { path: 'solicitudes', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'clientes', loadComponent: () => import('./pages/operador/clientes.page').then(m => m.OperatorClientesPage) },
      { path: 'cotizaciones', loadComponent: () => import('./pages/operador/pedidos.page').then(m => m.OperatorOrdersPage), data: { view: 'cotizaciones' } },
      { path: 'pagos', loadComponent: () => import('./pages/operador/pedidos.page').then(m => m.OperatorOrdersPage), data: { view: 'pagos' } },
      { path: 'ventas', redirectTo: 'ventas/presencial', pathMatch: 'full' },
      { path: 'ventas/presencial', loadComponent: () => import('./pages/operador/venta-presencial.page').then(m => m.OperatorVentaPresencialPage) },
      { path: 'calendario', loadComponent: () => import('./pages/operador/calendario.page').then(m => m.OperatorCalendarPage) },
      { path: 'perfil', canMatch: [authGuard], loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) }
    ]
  }
];

