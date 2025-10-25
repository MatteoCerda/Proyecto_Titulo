import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { PedidosService, PedidoResumen } from '../../services/pedidos.service';

@Component({
  standalone: true,
  selector: 'app-operator-orders',
  imports: [CommonModule, DatePipe],
  template: `
    <div class="operator-content status-view">
      <header class="content-header">
        <div>
          <h1>{{ title() }}</h1>
          <p>{{ description() }}</p>
        </div>
        <div class="header-meta">
          <span class="badge">{{ orders().length }} pedidos</span>
          <button type="button" class="ghost" (click)="refresh()">Refrescar</button>
        </div>
      </header>

      <div class="alerts">
        <div class="alert warn" *ngIf="error()">{{ error() }}</div>
        <div class="alert success" *ngIf="actionFeedback()?.type === 'success'">
          {{ actionFeedback()?.message }}
        </div>
        <div class="alert error" *ngIf="actionFeedback()?.type === 'error'">
          {{ actionFeedback()?.message }}
        </div>
      </div>

      <section class="orders-table" *ngIf="orders().length > 0; else emptyState">
        <div class="table-head">
          <span>Nombre de usuario</span>
          <span>Correo electronico</span>
          <span>Estado</span>
          <span>Actualizado</span>
          <span>Acciones</span>
        </div>

        <div class="table-row" *ngFor="let order of orders(); trackBy: trackById" (click)="select(order)">
          <div class="cell user">
            <div class="avatar">{{ initials(order.cliente) }}</div>
            <div>
              <strong>{{ order.cliente }}</strong>
              <small>Pedido #{{ order.id }}</small>
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
            <button type="button" class="ghost" (click)="select(order, $event)">Ver detalle</button>
            <button
              type="button"
              class="primary"
              *ngIf="view === 'cotizaciones'"
              (click)="sendToPayments(order, $event)"
            >
              Enviar a pagos
            </button>
          </div>
        </div>
      </section>

      <ng-template #emptyState>
        <div class="empty">
          <h3>No hay pedidos en esta bandeja</h3>
          <p>{{ emptyMessage() }}</p>
          <button type="button" (click)="refresh()">Actualizar ahora</button>
        </div>
      </ng-template>
    </div>

    <section class="detail-panel" *ngIf="selectedOrder() as selection">
      <header>
        <div class="title-wrap">
          <h2>Detalle del pedido</h2>
          <span class="status-tag" [ngClass]="statusClass(selection.estado)">{{ labelEstado(selection.estado) }}</span>
        </div>
        <button type="button" (click)="closeDetail()">Cerrar</button>
      </header>
      <div class="review-banner" *ngIf="selection.estado === 'EN_REVISION'">
        <h3>Pedido en revisión</h3>
        <p>Valida cantidades, materiales y comentarios antes de enviarlo a la etapa de pago.</p>
      </div>
      <div class="payments-banner" *ngIf="selection.estado === 'POR_PAGAR'">
        <h3>Pedido por pagar</h3>
        <p>Comparte el enlace de pago con el cliente y espera la confirmación antes de producir.</p>
      </div>
      <ul>
        <li><span>ID pedido</span><strong>#{{ selection.id }}</strong></li>
        <li><span>Cliente</span><strong>{{ selection.cliente }}</strong></li>
        <li><span>Correo</span><strong>{{ selection.email }}</strong></li>
        <li><span>Estado</span><strong>{{ labelEstado(selection.estado) }}</strong></li>
        <li><span>Actualizado</span><strong>{{ selection.createdAt | date:'medium' }}</strong></li>
        <li><span>Total estimado</span><strong>{{ selection.total ? ('$' + (selection.total | number:'1.0-0')) : 'Por definir' }}</strong></li>
        <li><span>Nro de items</span><strong>{{ selection.items || '-' }}</strong></li>
        <li><span>Material</span><strong>{{ selection.materialLabel || 'Por definir' }}</strong></li>
      </ul>
      <div class="note-block" *ngIf="selection.note">
        <h3>Notas del cliente</h3>
        <p>{{ selection.note }}</p>
      </div>
      <ng-container *ngIf="selection.payload as payload">
        <div class="note-block" *ngIf="!selection.note && payload?.note">
          <h3>Notas del cliente</h3>
          <p>{{ payload.note }}</p>
        </div>
        <div class="items-block" *ngIf="payload?.items?.length">
          <h3>Diseños solicitados</h3>
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
      <div class="detail-actions" *ngIf="view === 'cotizaciones'">
        <button type="button" class="primary" (click)="sendToPayments(selection, $event)">Enviar a pagos</button>
      </div>
    </section>
  `,
  styleUrls: ['./dashboard.page.css']
})
export class OperatorOrdersPage implements OnInit, OnDestroy {
  private readonly pedidos = inject(PedidosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly view: 'cotizaciones' | 'pagos' =
    (this.route.snapshot.data['view'] as string) === 'pagos' ? 'pagos' : 'cotizaciones';

  readonly title = computed(() =>
    this.view === 'pagos' ? 'Pedidos por pagar' : 'Cotizaciones en revision'
  );

  readonly description = computed(() =>
    this.view === 'pagos'
      ? 'Gestiona los pedidos listos para pago y coordina la documentacion con el cliente.'
      : 'Revisa las solicitudes tomadas por el equipo antes de enviarlas a la etapa de pago.'
  );

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedOrder = signal<PedidoResumen | null>(null);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  private paramsSub?: Subscription;

  ngOnInit(): void {
    this.refresh();
    this.paramsSub = this.route.queryParamMap.subscribe(() => this.applySelectionFromQuery());
  }

  ngOnDestroy(): void {
    this.paramsSub?.unsubscribe();
  }

  refresh(): void {
    this.actionFeedback.set(null);
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const status = this.view === 'pagos' ? 'POR_PAGAR' : 'EN_REVISION';
      const data = await firstValueFrom(this.pedidos.listByStatus(status));
      this.orders.set(data);
      this.error.set(null);
      this.applySelectionFromQuery(true);
    } catch (err) {
      console.error('Error cargando pedidos', err);
      this.error.set('No pudimos cargar los pedidos. Intenta nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  select(order: PedidoResumen, event?: Event): void {
    event?.stopPropagation();
    this.selectedOrder.set(order);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { selected: order.id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { selected: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  async sendToPayments(order: PedidoResumen, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (this.view !== 'cotizaciones') {
      return;
    }
    try {
      await firstValueFrom(this.pedidos.markAsSeen(order.id, 'POR_PAGAR'));
      this.actionFeedback.set({ type: 'success', message: `Pedido #${order.id} enviado a pagos.` });
      this.orders.update(items => items.filter(item => item.id !== order.id));
      this.selectedOrder.set(null);
      this.router.navigate(['/operador/pagos'], { queryParams: { selected: order.id } });
    } catch (err) {
      console.error('No se pudo enviar a pagos', err);
      this.actionFeedback.set({ type: 'error', message: 'No logramos mover el pedido a pagos.' });
    }
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
      case 'POR_PAGAR':
        return 'por-pagar';
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
      POR_PAGAR: 'Por pagar',
      EN_PRODUCCION: 'En produccion',
      COMPLETADO: 'Completado'
    };
    return labels[estado] || estado;
  }

  emptyMessage(): string {
    return this.view === 'pagos'
      ? 'Cuando un pedido quede listo para cobrar aparecera aqui.'
      : 'Cuando un operador tome un pedido se mostrara en esta bandeja de revision.';
  }

  private applySelectionFromQuery(forceFirst = false): void {
    const params = this.route.snapshot.queryParamMap;
    const selectedId = Number(params.get('selected'));
    if (selectedId) {
      const match = this.orders().find(item => item.id === selectedId) || null;
      if (match) {
        this.selectedOrder.set(match);
        return;
      }
      if (!forceFirst) {
        this.selectedOrder.set(null);
        return;
      }
    }
    if (forceFirst && this.orders().length) {
      this.selectedOrder.set(this.orders()[0]);
    } else if (!this.orders().length) {
      this.selectedOrder.set(null);
    }
  }
}

