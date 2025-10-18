import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';
import { OperatorInboxStore } from '../services/operator-inbox.store';

@Component({
  standalone: true,
  selector: 'app-operator-shell',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, IonContent, IonHeader, IonToolbar, IonIcon],
  template: `
    <ion-header class="op-header">
      <ion-toolbar class="op-toolbar">
        <div class="op-bar">
          <a class="op-brand" routerLink="/operador/solicitudes">
            <img src="assets/kingston-estampados.png" alt="Kingstone logo" />
            <span>Centro de Operaciones</span>
          </a>
          <nav class="op-nav">
            <a routerLink="/operador/solicitudes" routerLinkActive="active">
              Solicitudes
              <span *ngIf="pendingCount() > 0" class="bubble">{{ pendingCount() }}</span>
            </a>
            <a routerLink="/operador/cotizaciones" routerLinkActive="active">Cotizaciones</a>
            <a routerLink="/operador/pagos" routerLinkActive="active">Pagos</a>
          </nav>
          <div class="op-actions">
            <button type="button" class="icon-btn" (click)="goProfile()" aria-label="Perfil operador">
              <ion-icon name="person-circle-outline"></ion-icon>
            </button>
            <button type="button" class="icon-btn" (click)="logout()" aria-label="Cerrar sesion">
              <ion-icon name="log-out-outline"></ion-icon>
            </button>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="op-content">
      <router-outlet></router-outlet>
    </ion-content>
  `,
  styleUrls: ['./operator-shell.component.scss']
})
export class OperatorShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly inbox = inject(OperatorInboxStore);

  readonly pendingCount = this.inbox.pendingCount;

  ngOnInit(): void {
    this.inbox.start();
  }

  ngOnDestroy(): void {
    this.inbox.stop();
  }

  goProfile(): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.router.navigateByUrl('/perfil');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
