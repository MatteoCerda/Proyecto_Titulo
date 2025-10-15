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
            <ion-icon src="/svg/person-outline.svg"></ion-icon>
          </button>
        </div>
      </div>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ks-main-content">
    <router-outlet></router-outlet>
  </ion-content>
  `,
  styles: [
    `
    .ks-header, .ks-toolbar { background:#0c4a6e; color:#fff; }
    .ks-bar { max-width:1180px; margin:0 auto; padding:6px 10px; display:flex; align-items:center; gap:18px; }
    .ks-logo { height:36px; }

    /* Nav con misma animación que el header principal */
    .ks-nav { display:flex; gap:20px; align-items:center; }
    .ks-nav a { position:relative; color:#fff; text-decoration:none; opacity:.9; font-weight:600; letter-spacing:.2px; padding:8px 0; }
    .ks-nav a:hover { opacity:1; }
    .ks-nav a::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:currentColor; border-radius:2px; transform:scaleX(0); transform-origin:center; transition:transform .18s ease; }
    .ks-nav a:hover::after, .ks-nav a.active::after { transform:scaleX(1); }

    .ks-actions { margin-left:auto; display:flex; gap:12px; align-items:center; }
    .icon-btn { background:none; border:0; color:#fff; width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; border-radius:10px; transition:background .15s ease, transform .08s ease; }
    .icon-btn:hover { background:rgba(255,255,255,.08); }
    .icon-btn:active { transform:scale(.98); }
    .icon-btn ion-icon { font-size:24px; }
    `
  ]
})
export class AdminLayoutComponent {
  auth = inject(AuthService);
  router = inject(Router);
  onProfileClick() {
    if (!this.auth.isAuthenticated()) { this.router.navigateByUrl('/login'); return; }
    // Ir directo a página de perfil (manteniendo header admin)
    this.router.navigateByUrl('/admin/perfil');
  }
  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
