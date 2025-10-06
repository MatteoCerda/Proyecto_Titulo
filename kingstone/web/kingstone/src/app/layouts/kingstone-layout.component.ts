import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-main-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, IonIcon],
  template: `
    <!-- Header -->
    <header class="header">
      <div class="header__logo" routerLink="/inicio">
        <img src="assets/kingstone-logo.png" alt="Kingstone Estampados" />
      </div>

      <div class="header__search">
        <input type="text" placeholder="Busca en toda la tienda..." />
        <ion-icon name="search-outline"></ion-icon>
      </div>

      <nav class="header__menu">
        <a routerLink="/login" *ngIf="!auth.isAuthenticated()">Iniciar sesión</a>
        <a routerLink="/cliente/mis-pedidos" *ngIf="role==='CLIENT'">Mis pedidos</a>
        <a routerLink="/operador/pedidos" *ngIf="role==='OPERATOR'">Gestión de pedidos</a>
        <a routerLink="/admin/usuarios" *ngIf="role==='ADMIN'">Administrar usuarios</a>
        <a (click)="logout()" *ngIf="auth.isAuthenticated()">Cerrar sesión</a>
      </nav>
    </header>

    <!-- Contenido de la página -->
    <main class="content">
      <router-outlet></router-outlet>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer__cols">
        <div>
          <h3>Kingstone Estampados</h3>
          <p>Tu centro de personalización textil y vinilos.</p>
        </div>
        <div>
          <h4>Enlaces</h4>
          <ul>
            <li><a routerLink="/inicio">Inicio</a></li>
            <li><a routerLink="/cliente/mis-pedidos">Mis pedidos</a></li>
            <li><a routerLink="/contacto">Contacto</a></li>
          </ul>
        </div>
        <div>
          <h4>Redes</h4>
          <p>Instagram | Facebook | WhatsApp</p>
        </div>
      </div>
      <div class="footer__bottom">© {{ year }} Kingston Estampados — Todos los derechos reservados.</div>
    </footer>
  `,
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent {
  private router = inject(Router);
  auth = inject(AuthService);
  role = this.auth.getRole();
  year = new Date().getFullYear();

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/inicio');
  }
}
