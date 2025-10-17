import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonIcon } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';

@Component({
  standalone: true,
  selector: 'app-admin-layout',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, IonHeader, IonToolbar, IonContent, IonIcon],
  template: `
  <ion-header class="ks-header">
    <ion-toolbar class="ks-toolbar">
      <div class="ks-bar">
        <a class="ks-logo-wrap" routerLink="/admin/inicio">
          <img src="assets/kingston-estampados.png" alt="Kingstone logo" class="ks-logo" />
        </a>
        <nav class="ks-nav">
          <a routerLink="/admin/usuarios" routerLinkActive="active">Gestionar usuario/rol</a>
          <a routerLink="/admin/catalogo" routerLinkActive="active">Administrar catálogo/precio</a>
          <a routerLink="/admin/reportes" routerLinkActive="active">Reportes y dashboards</a>
          <a routerLink="/admin/stock" routerLinkActive="active">Administrar stock</a>
        </nav>
        <div class="ks-actions">
          <button type="button" class="icon-btn" aria-label="Cuenta" (click)="onProfileClick()">
            <ion-icon name="person-outline"></ion-icon>
          </button>
        </div>
      </div>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ks-main-content">
    <router-outlet></router-outlet>
  </ion-content>
  `,
  styleUrls: ['./admin-layout.component.scss']
})
export class AdminLayoutComponent {
  auth = inject(AuthService);
  router = inject(Router);

  onProfileClick() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.router.navigateByUrl('/admin/perfil');
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
