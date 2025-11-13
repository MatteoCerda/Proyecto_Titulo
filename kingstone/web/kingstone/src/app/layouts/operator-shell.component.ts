import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';
import { OperatorInboxStore } from '../services/operator-inbox.store';

@Component({
  standalone: true,
  selector: 'app-operator-shell',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, IonContent],
  template: `
    <ion-content class="shell-content-wrapper" [fullscreen]="true">
      <div class="operator-shell">
        <aside class="shell-sidebar">
          <div class="sidebar-brand">
            <img src="assets/kingston-estampados.png" alt="Kingstone logo" />
            <div class="sidebar-operator">
              <span>Nombre operador</span>
              <strong>{{ auth.displayName() || auth.getEmail() || 'Operador' }}</strong>
            </div>
          </div>

          <nav class="sidebar-nav">
            <a routerLink="/operador/inicio" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
              <span>Inicio</span>
              <span class="bubble" *ngIf="pendingCount() > 0">{{ pendingCount() }}</span>
            </a>
            <a routerLink="/operador/cotizaciones" routerLinkActive="active">
              Cotizaciones
            </a>
            <a routerLink="/operador/pagos" routerLinkActive="active">
              Pagos
            </a>
            <div class="nav-group">
              <span>Gestión</span>
              <a routerLink="/operador/clientes" routerLinkActive="active">Clientes</a>
              <a routerLink="/operador/ventas/presencial" routerLinkActive="active">Venta presencial</a>
              <a routerLink="/operador/calendario" routerLinkActive="active">Calendario</a>
            </div>
          </nav>

          <div class="sidebar-actions">
            <button type="button" class="primary" (click)="refreshInbox()">Actualizar bandeja</button>
            <button type="button" class="ghost" (click)="goProfile()">Perfil</button>
            <button type="button" class="ghost" (click)="logout()">Cerrar sesión</button>
          </div>
        </aside>

        <main class="shell-main">
          <header class="shell-head">
            <div>
              <p>Centro de operaciones</p>
              <h1>Panel del operador</h1>
            </div>
            <div class="head-actions">
              <span class="head-pill" *ngIf="pendingCount() > 0">
                {{ pendingCount() }} pendientes
              </span>
              <button type="button" class="ghost" (click)="refreshInbox()">Actualizar</button>
            </div>
          </header>

          <section class="shell-content">
            <router-outlet></router-outlet>
          </section>
        </main>
      </div>
    </ion-content>
  `,
  styleUrls: ['./operator-shell.component.scss']
})
export class OperatorShellComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly inbox = inject(OperatorInboxStore);

  readonly pendingCount = this.inbox.pendingCount;

  ngOnInit(): void {
    this.inbox.start();
    this.auth.ensureMe();
  }

  ngOnDestroy(): void {
    this.inbox.stop();
  }

  refreshInbox(): void {
    void this.inbox.refresh();
  }

  goProfile(): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.router.navigateByUrl('/operador/perfil');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
