import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { OperatorInboxStore } from '../../services/operator-inbox.store';
import { AuthService } from '../../core/auth.service';
import { PedidoResumen } from '../../services/pedidos.service';

@Component({
  standalone: true,
  selector: 'app-operator-dashboard',
  imports: [CommonModule, DatePipe, RouterLink, RouterLinkActive],
  template: `
    <section class="operator-layout">
      <aside class="operator-sidebar">
        <header>
          <h2>Datos de cuenta</h2>
          <p>{{ account()?.fullName || account()?.email }}</p>
        </header>
        <nav>
          <a routerLink="/operador/solicitudes" routerLinkActive="active">Solicitudes</a>
          <a routerLink="/operador/cotizaciones" routerLinkActive="active">
            Cotizaciones recientes
            <span *ngIf="pendingCount() > 0" class="warn">{{ pendingCount() }}</span>
          </a>
          <a routerLink="/operador/pagos" routerLinkActive="active">Pagos</a>
        </nav>
        <footer>
          <button type="button" (click)="refresh()">Actualizar bandeja</button>
        </footer>
      </aside>

      <div class="operator-content">
        <header class="content-header">
          <div>
            <h1>Solicitudes de clientes</h1>
            <p>Revisa y deriva los pedidos enviados desde la seccion de cotizacion.</p>
          </div>
          <div class="header-meta">
            <span class="badge">{{ orders().length }} solicitudes</span>
            <button type="button" class="ghost" (click)="refresh()">Refrescar</button>
          </div>
        </header>

        <div class="alerts">
          <div class="alert" *ngIf="pendingCount() > 0">
            <strong>{{ pendingCount() }}</strong>
            <span>nuevas solicitudes pendientes de revision.</span>
          </div>
          <div class="alert warn" *ngIf="error()">{{ error() }}</div>
        </div>

        <section class="orders-table" *ngIf="orders().length > 0; else emptyState">
          <div class="table-head">
            <span>Nombre de usuario</span>
            <span>Correo electronico</span>
            <span>Estado</span>
            <span>Recibido</span>
            <span>Acciones</span>
          </div>

          <div class="table-row" *ngFor="let order of orders(); trackBy: trackById" (click)="select(order)">
            <div class="cell user">
              <div class="avatar">{{ initials(order.cliente) }}</div>
              <div>
                <strong>{{ order.cliente }}</strong>
                <small>Cotizacion #{{ order.id }}</small>
                <span class="chip" *ngIf="order.notificado !== false">Nuevo</span>
              </div>
            </div>
            <div class="cell">
              <span>{{ order.email }}</span>
            </div>
            <div class="cell">
              <span class="status" [ngClass]="statusClass(order.estado)">{{ labelEstado(order.estado) }}</span>
            </div>
            <div class="cell">
              <span>{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
            </div>
            <div class="cell actions">
              <button type="button" class="ghost" (click)="markSeen(order, $event)">Marcar revision</button>
              <button type="button" class="primary" (click)="viewDetails(order, $event)">Ver detalle</button>
            </div>
          </div>
        </section>

        <ng-template #emptyState>
          <div class="empty">
            <h3>No hay solicitudes pendientes</h3>
            <p>Cuando un cliente envie una nueva cotizacion aparecera automaticamente en este listado.</p>
            <button type="button" (click)="refresh()">Actualizar ahora</button>
          </div>
        </ng-template>
      </div>
    </section>

    <section class="detail-panel" *ngIf="selectedOrder() as selection">
      <header>
        <h2>Resumen de la solicitud</h2>
        <button type="button" (click)="closeDetail()">Cerrar</button>
      </header>
      <ul>
        <li><span>ID pedido</span><strong>#{{ selection.id }}</strong></li>
        <li><span>Cliente</span><strong>{{ selection.cliente }}</strong></li>
        <li><span>Correo</span><strong>{{ selection.email }}</strong></li>
        <li><span>Estado</span><strong>{{ labelEstado(selection.estado) }}</strong></li>
        <li><span>Recibido</span><strong>{{ selection.createdAt | date:'medium' }}</strong></li>
        <li><span>Total estimado</span><strong>{{ selection.total ? ('$' + (selection.total | number:'1.0-0')) : 'Por definir' }}</strong></li>
        <li><span>Nro de items</span><strong>{{ selection.items || '-' }}</strong></li>
        <li><span>Material</span><strong>{{ selection.materialLabel || 'Por definir' }}</strong></li>
      </ul>
      <div class="note-block" *ngIf="selection.note">
        <h3>Indicaciones del cliente</h3>
        <p>{{ selection.note }}</p>
      </div>
      <ng-container *ngIf="selection.payload as payload">
        <div class="note-block" *ngIf="!selection.note && payload?.note">
          <h3>Indicaciones del cliente</h3>
          <p>{{ payload.note }}</p>
        </div>
        <div class="items-block" *ngIf="payload?.items?.length">
          <h3>Disenos solicitados</h3>
          <ul>
            <li *ngFor="let item of payload.items">
              <span class="item-name">{{ item.displayName || item.name }}</span>
              <span class="item-size">{{ item.widthCm | number:'1.0-1' }} x {{ item.heightCm | number:'1.0-1' }} cm</span>
              <span class="item-qty">{{ item.quantity }} uds</span>
            </li>
          </ul>
        </div>
      </ng-container>
    </section>
  `,
  styleUrls: ['./dashboard.page.css']
})
export class OperatorDashboardPage implements OnInit, OnDestroy {
  private readonly inbox = inject(OperatorInboxStore);
  private readonly auth = inject(AuthService);

  readonly orders = this.inbox.orders;
  readonly loading = this.inbox.loading;
  readonly error = this.inbox.error;
  readonly pendingCount = this.inbox.pendingCount;

  readonly account = computed(() => this.auth.user());

  readonly selectedOrder = signal<PedidoResumen | null>(null);

  ngOnInit(): void {
    this.inbox.start();
    this.inbox.refresh();
  }

  ngOnDestroy(): void {
    this.selectedOrder.set(null);
  }

  refresh(): void {
    this.inbox.refresh();
  }

  select(order: PedidoResumen): void {
    this.selectedOrder.set(order);
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
  }

  markSeen(order: PedidoResumen, event: Event): void {
    event.stopPropagation();
    this.inbox.markAsSeen(order.id);
  }

  viewDetails(order: PedidoResumen, event: Event): void {
    event.stopPropagation();
    this.selectedOrder.set(order);
  }

  trackById(_: number, item: PedidoResumen): number {
    return item.id;
  }

  initials(name: string): string {
    return name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?';
  }

  statusClass(estado: string): string {
    switch (estado) {
      case 'PENDIENTE':
        return 'pending';
      case 'EN_REVISION':
        return 'review';
      case 'EN_PRODUCCION':
        return 'in-progress';
      case 'COMPLETADO':
        return 'done';
      default:
        return 'pending';
    }
  }

  labelEstado(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      EN_REVISION: 'En revision',
      EN_PRODUCCION: 'En produccion',
      COMPLETADO: 'Completado'
    };
    return labels[estado] || estado;
  }
}
