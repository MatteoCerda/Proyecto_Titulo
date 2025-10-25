import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PedidosService, PedidoResumen } from '../../services/pedidos.service';

@Component({
  standalone: true,
  selector: 'app-metodos-pago',
  imports: [CommonModule, IonContent, IonButton, DatePipe, RouterLink],
  template: `
    <ion-content class="metodos-pago">
      <div class="wrap">
        <header class="header">
          <div>
            <h1>Metodos de pago</h1>
            <p>Revisa los pedidos que estan listos para pago.</p>
          </div>
          <div class="header-actions">
            <ion-button fill="outline" color="primary" (click)="refresh()">Actualizar</ion-button>
            <ion-button color="medium" routerLink="/cliente/mis-pedidos">Ver mis pedidos</ion-button>
          </div>
        </header>

        <section class="notice" *ngIf="loading()">Buscando pedidos por pagar...</section>
        <section class="notice error" *ngIf="error()">{{ error() }}</section>

        <section class="statuses" *ngIf="orders().length > 0; else emptyState">
          <article class="status-card" *ngFor="let order of orders(); trackBy: trackById">
            <header>
              <h2>#{{ order.id }}</h2>
              <span>{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
            </header>
            <div class="status-label por-pagar">Por pagar</div>
            <div class="actions">
              <ion-button fill="outline" color="primary" routerLink="/cliente/mis-pedidos">Detalle del pedido</ion-button>
              <ion-button color="success" href="https://wa.me/56986412218" target="_blank">Confirmar pago</ion-button>
            </div>
          </article>
        </section>

        <ng-template #emptyState>
          <section class="empty">
            <h2>No tienes pedidos por pagar</h2>
            <p>Cuando un pedido sea aprobado aparecera aqui para completar el pago.</p>
            <ion-button color="primary" routerLink="/cliente/mis-pedidos">Volver al historial</ion-button>
          </section>
        </ng-template>
      </div>
    </ion-content>
  `,
  styleUrls: ['./metodos-pago.page.scss']
})
export class MetodosPagoPage implements OnInit {
  private readonly pedidos = inject(PedidosService);

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.pedidos.listMine('POR_PAGAR'));
      this.orders.set(data);
      this.error.set(null);
    } catch (err: any) {
      console.error('Error obteniendo pedidos por pagar', err);
      const status = err?.status;
      if (status === 401) {
        this.error.set('Debes iniciar sesion para ver los pedidos por pagar.');
      } else if (status === 403) {
        this.error.set('Tu cuenta no tiene permisos para ver esta informacion.');
      } else {
        this.error.set('No pudimos cargar los pedidos por pagar. Intenta mas tarde.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  trackById(_: number, order: PedidoResumen): number {
    return order.id;
  }
}
