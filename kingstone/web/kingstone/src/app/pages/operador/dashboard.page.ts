import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OperatorInboxStore } from '../../services/operator-inbox.store';
import { AuthService } from '../../core/auth.service';
import { ClientePedidosResumen, PedidosService, PedidoResumen } from '../../services/pedidos.service';

type FrequentClientSummary = {
  name: string;
  email: string | null;
  count: number;
  total: number;
};

@Component({
  standalone: true,
  selector: 'app-operator-dashboard',
  imports: [CommonModule, DatePipe, RouterLink, RouterLinkActive],
  template: `
    <section class="dashboard-wrapper">
      <header class="dashboard-hero">
        <div>
          <p>Centro de gesti&oacute;n</p>
          <h1>Inicio del operador</h1>
          <small>{{ orders().length }} solicitudes activas</small>
        </div>
        <div class="hero-actions">
          <button type="button" class="ghost" (click)="refresh()">Actualizar bandeja</button>
          <a routerLink="/operador/ventas/presencial" class="primary-link">Registrar venta</a>
        </div>
      </header>

      <div class="totals-grid">
        <article class="metric-card">
          <span>Total hoy</span>
          <strong>{{ formatCurrency(overviewTotals().day) }}</strong>
          <small>Ingresos registrados</small>
        </article>
        <article class="metric-card">
          <span>Total semanal</span>
          <strong>{{ formatCurrency(overviewTotals().week) }}</strong>
          <small>Pedidos desde lunes</small>
        </article>
        <article class="metric-card">
          <span>Total mensual</span>
          <strong>{{ formatCurrency(overviewTotals().month) }}</strong>
          <small>Acumulado del mes</small>
        </article>
      </div>

      <div class="dashboard-main">
        <div class="orders-column">
          <section class="orders-card">
            <header class="orders-head">
              <div>
                <h2>Solicitudes de clientes</h2>
                <p>Revisa y deriva los pedidos enviados desde la secci&oacute;n de cotizaci&oacute;n.</p>
              </div>
              <span class="badge">{{ orders().length }} solicitudes</span>
            </header>

            <div class="alerts">
              <div class="alert" *ngIf="pendingCount() > 0">
                <strong>{{ pendingCount() }}</strong>
                <span>nuevas solicitudes pendientes de revisi&oacute;n.</span>
              </div>
              <div class="alert" [ngClass]="actionFeedback()?.type" *ngIf="actionFeedback() as action">
                <span>{{ action.message }}</span>
              </div>
              <div class="alert warn" *ngIf="error()">{{ error() }}</div>
            </div>

            <section class="orders-table" *ngIf="pagedOrders().length > 0; else emptyState">
              <div class="table-head">
                <span>Nombre de usuario</span>
                <span>Correo electr&oacute;nico</span>
                <span>Estado</span>
                <span>Recibido</span>
                <span>Acciones</span>
              </div>

              <div class="table-row" *ngFor="let order of pagedOrders(); trackBy: trackById" (click)="select(order)">
                <div class="cell user">
                  <div class="avatar">{{ initials(order.cliente) }}</div>
                  <div>
                    <strong>{{ order.cliente }}</strong>
                    <small>Ingresado el {{ order.createdAt | date:'dd/MM/yyyy' }}</small>
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
                  <button type="button" class="ghost" (click)="markSeen(order, $event)">Marcar revisi&oacute;n</button>
                  <button type="button" class="ghost send-payments" (click)="sendToPayments(order, $event)">Enviar a pagos</button>
                  <button type="button" class="primary" (click)="viewDetails(order, $event)">Ver detalle</button>
                </div>
              </div>
            </section>

            <div class="pagination" *ngIf="pageCount() > 1">
              <button type="button" class="ghost" [disabled]="currentPage() === 1" (click)="prevPage()">Anterior</button>
              <span>Pagina {{ currentPage() }} de {{ pageCount() }}</span>
              <button type="button" class="ghost" [disabled]="currentPage() === pageCount()" (click)="nextPage()">Siguiente</button>
            </div>

            <ng-template #emptyState>
              <div class="empty">
                <h3>No hay solicitudes pendientes</h3>
                <p>Cuando un cliente env&iacute;e una nueva cotizaci&oacute;n aparecer&aacute; autom&aacute;ticamente en este listado.</p>
                <button type="button" (click)="refresh()">Actualizar ahora</button>
              </div>
            </ng-template>
          </section>

          <section class="detail-panel" *ngIf="selectedOrder() as selection">
            <header>
              <div class="title-wrap">
                <h2>Resumen de la solicitud</h2>
                <span class="status-tag" [ngClass]="statusClass(selection.estado)">{{ labelEstado(selection.estado) }}</span>
              </div>
              <button type="button" (click)="closeDetail()">Cerrar</button>
            </header>
            <div class="review-banner" *ngIf="selection.estado === 'EN_REVISION'">
              <h3>Solicitud en revisi&oacute;n</h3>
              <p>Revisa cada detalle para informar al cliente el avance y tomar la siguiente acci&oacute;n.</p>
            </div>
            <ul>
              <li><span>ID pedido</span><strong>#{{ selection.id }}</strong></li>
              <li><span>Cliente</span><strong>{{ selection.cliente }}</strong></li>
              <li><span>Correo</span><strong>{{ selection.email }}</strong></li>
              <li><span>Estado</span><strong>{{ labelEstado(selection.estado) }}</strong></li>
              <li><span>Recibido</span><strong>{{ selection.createdAt | date:'medium' }}</strong></li>
              <li>
                <span>Total estimado</span>
                <strong>{{ selection.total !== null && selection.total !== undefined ? formatCurrency(selection.total) : 'Por definir' }}</strong>
              </li>
              <li><span>Nro de items</span><strong>{{ selection.items || '-' }}</strong></li>
              <li><span>Material</span><strong>{{ selection.materialLabel || 'Por definir' }}</strong></li>
            </ul>
            <div class="note-block" *ngIf="selection.note">
              <h3>Indicaciones del cliente</h3>
              <p>{{ selection.note }}</p>
            </div>
            <ng-container *ngIf="orderPayload(selection) as payload">
              <div class="note-block" *ngIf="!selection.note && payload?.note">
                <h3>Indicaciones del cliente</h3>
                <p>{{ payload.note }}</p>
              </div>
              <ng-container *ngIf="payloadItems(payload) as items">
                <div class="items-block" *ngIf="items.length">
                  <h3>Items solicitados</h3>
                  <ul>
                    <li *ngFor="let item of items; trackBy: trackByItem">
                      <span class="item-name">{{ item.name }}</span>
                      <span class="item-size" *ngIf="item.size">{{ item.size }}</span>
                      <span class="item-qty">{{ item.quantity }} m</span>
                    </li>
                  </ul>
                  <div class="items-summary">
                    <span>Total metros solicitados</span>
                    <strong>{{ totalItemsQuantity(items) }} m</strong>
                  </div>
                </div>
              </ng-container>
            </ng-container>
            <footer class="detail-actions">
              <button
                type="button"
                class="ghost danger"
                *ngIf="canRejectForCopyright(selection)"
                (click)="rejectForCopyright(selection)"
              >
                Rechazar por copyright
              </button>
              <button type="button" class="ghost" (click)="openClienteModal(selection)">Historial del cliente</button>
              <button type="button" class="ghost" (click)="goToClienteInfo(selection)">Ver ficha del cliente</button>
              <button type="button" class="ghost" (click)="markSeen(selection)">Derivar a cotizaciones</button>
              <button type="button" class="primary" (click)="sendToPayments(selection)">Enviar a pagos</button>
            </footer>
          </section>
        </div>

        <aside class="dashboard-side">
          <article class="card frequent-card">
            <header>
              <h3>Clientes frecuentes</h3>
              <span *ngIf="frequentLoading()">Cargando...</span>
              <span *ngIf="!frequentLoading() && frequentClients().length">{{ frequentClients().length }} perfiles</span>
            </header>
                        <ul>
              <ng-container *ngIf="!frequentLoading() && !frequentError(); else frequentState">
                <li *ngFor="let client of frequentClients()">
                  <div>
                    <strong>{{ client.name }}</strong>
                    <small>{{ client.email || 'Correo no registrado' }}</small>
                  </div>
                  <span>{{ client.count }} pedidos  {{ formatCurrency(client.total) }}</span>
                </li>
                <li class="placeholder" *ngIf="!frequentClients().length">
                  <span>Aun no hay historial suficiente.</span>
                </li>
              </ng-container>
              <ng-template #frequentState>
                <li class="placeholder" *ngIf="frequentLoading()">
                  <span>Cargando historial</span>
                </li>
                <li class="placeholder" *ngIf="frequentError()">
                  <span>{{ frequentError() }}</span>
                </li>
              </ng-template>
            </ul>
          </article>

          <article class="card quick-card">
            <h3>Accesos r&aacute;pidos</h3>
            <p>Gestiona tu d&iacute;a a d&iacute;a desde aqu&iacute;.</p>
            <div class="quick-actions">
              <button type="button" class="ghost" routerLink="/operador/clientes">Ver clientes</button>
              <button type="button" class="ghost" routerLink="/operador/calendario">Calendario</button>
              <button type="button" class="ghost" routerLink="/operador/pagos">Pagos</button>
            </div>
          </article>
        </aside>
      </div>
    </section>

    <div class="cliente-modal-backdrop" *ngIf="clienteModalOpen()" (click)="closeClienteModal()">
      <div class="cliente-modal" (click)="$event.stopPropagation()">
        <header class="cliente-modal-header">
          <div>
            <h2>Historial de pedidos</h2>
            <p>Revisa los pedidos asociados a cada cliente y su estado actual.</p>
          </div>
          <button type="button" class="ghost" (click)="closeClienteModal()">Cerrar</button>
        </header>
        <section class="cliente-modal-body">
          <aside class="cliente-modal-list">
            <div class="estado" *ngIf="clientesLoading()">Cargando clientes...</div>
            <div class="estado error" *ngIf="clientesError()">{{ clientesError() }}</div>
            <ul *ngIf="!clientesLoading() && !clientesError()">
              <li
                *ngFor="let cliente of clientesResumen(); trackBy: trackByCliente"
                [class.active]="isClienteSelected(cliente)"
                (click)="selectCliente(cliente.email)"
              >
                <strong>{{ cliente.nombre || cliente.email || 'Sin nombre' }}</strong>
                <span>{{ cliente.pedidos.length }} pedidos</span>
              </li>
            </ul>
          </aside>
          <div class="cliente-modal-detail">
            <ng-container *ngIf="clienteSeleccionActual() as clienteSeleccionado; else clientePlaceholder">
              <header>
                <h3>{{ clienteSeleccionado.nombre || clienteSeleccionado.email || 'Cliente sin nombre' }}</h3>
                <p>{{ clienteSeleccionado.email || 'Correo no registrado' }}</p>
              </header>
              <div class="cliente-orders" *ngIf="clienteSeleccionado.pedidos?.length; else sinPedidos">
                <article class="cliente-order-card" *ngFor="let pedido of clienteSeleccionado.pedidos">
                  <header>
                    <strong>#{{ pedido.id }}</strong>
                    <span class="status" [ngClass]="statusClass(pedido.estado)">{{ labelEstado(pedido.estado) }}</span>
                  </header>
                  <div class="meta">
                    <span>{{ pedido.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
                    <span *ngIf="pedido.total !== null && pedido.total !== undefined">Total: {{ formatCurrency(pedido.total) }}</span>
                    <span *ngIf="pedido.material">{{ pedido.material }}</span>
                  </div>
                </article>
              </div>
              <ng-template #sinPedidos>
                <p class="cliente-placeholder">No hay pedidos registrados para este cliente.</p>
              </ng-template>
            </ng-container>
            <ng-template #clientePlaceholder>
              <p class="cliente-placeholder">Selecciona un cliente para ver su historial.</p>
            </ng-template>
          </div>
        </section>
      </div>
    </div>
  `,
  styleUrls: ['./dashboard.page.css']
})
export class OperatorDashboardPage implements OnInit, OnDestroy {
  private readonly inbox = inject(OperatorInboxStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly pedidos = inject(PedidosService);
  private readonly currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  readonly orders = this.inbox.orders;
  readonly loading = this.inbox.loading;
  readonly error = this.inbox.error;
  readonly pendingCount = this.inbox.pendingCount;

  readonly overviewTotals = signal({ day: 0, week: 0, month: 0 });

  readonly frequentClients = signal<FrequentClientSummary[]>([]);
  readonly frequentLoading = signal(false);
  readonly frequentError = signal<string | null>(null);

  readonly selectedOrder = signal<PedidoResumen | null>(null);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly clienteModalOpen = signal(false);
  readonly clientesLoading = signal(false);
  readonly clientesError = signal<string | null>(null);
  readonly clientesResumen = signal<ClientePedidosResumen[]>([]);
  readonly clienteSeleccionada = signal<string | null>(null);
  readonly clienteSeleccionActual = computed(() => {
    const target = this.clienteSeleccionada();
    if (!target) {
      return null;
    }
    return (
      this.clientesResumen().find(cliente => this.normalizeEmail(cliente.email) === target) ?? null
    );
  });
  readonly pageSize = 3;
  readonly currentPage = signal(1);
  readonly pageCount = computed(() => {
    const total = this.orders().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });
  readonly pagedOrders = computed(() => {
    const current = this.currentPage();
    const start = (current - 1) * this.pageSize;
    return this.orders().slice(start, start + this.pageSize);
  });

  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly paginationEffect = effect(() => {
    const totalPages = this.pageCount();
    const current = this.currentPage();
    if (current > totalPages) {
      this.currentPage.set(totalPages);
      return;
    }
    const selection = this.selectedOrder();
    const orders = this.pagedOrders();
    if (!selection && orders.length) {
      this.selectedOrder.set(orders[0]);
    } else if (selection && !orders.some(order => order.id === selection.id)) {
      // preserve selection if still in overall list; otherwise fall back to first visible
      const exists = this.orders().some(order => order.id === selection.id);
      if (!exists && orders.length) {
        this.selectedOrder.set(orders[0]);
      }
    }
  });

  ngOnInit(): void {
    this.inbox.start();
    this.inbox.refresh();
    this.loadTotals();
    void this.loadFrequentClients();
  }

  ngOnDestroy(): void {
    this.selectedOrder.set(null);
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  refresh(): void {
    this.inbox.refresh();
    this.clearActionFeedback();
    this.loadTotals();
    void this.loadFrequentClients();
  }

  select(order: PedidoResumen): void {
    this.selectedOrder.set(order);
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
  }

  async markSeen(order: PedidoResumen, event?: Event): Promise<void> {
    event?.stopPropagation();
    const result = await this.inbox.markAsSeen(order.id, 'EN_REVISION');
    if (result.success) {
      const reviewOrder = result.order ?? { ...order, estado: 'EN_REVISION' };
      this.selectedOrder.set(null);
      this.router.navigate(['/operador/cotizaciones'], {
        queryParams: { selected: reviewOrder.id }
      });
    } else {
      this.pushActionFeedback('error', 'No pudimos actualizar el estado del pedido.');
    }
  }

  async sendToPayments(order: PedidoResumen, event?: Event): Promise<void> {
    event?.stopPropagation();
    const result = await this.inbox.markAsSeen(order.id, 'POR_PAGAR');
    if (result.success) {
      const updatedOrder = result.order ?? { ...order, estado: 'POR_PAGAR' };
      this.selectedOrder.set(null);
      this.router.navigate(['/operador/pagos'], {
        queryParams: { selected: updatedOrder.id }
      });
    } else {
      this.pushActionFeedback('error', 'No pudimos mover el pedido a pagos.');
    }
  }
  setPage(page: number): void {
    const target = Math.min(Math.max(page, 1), this.pageCount());
    if (target !== this.currentPage()) {
      this.currentPage.set(target);
      this.selectedOrder.set(null);
    }
  }

  nextPage(): void {
    this.setPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.setPage(this.currentPage() - 1);
  }

  canRejectForCopyright(order: PedidoResumen | null): boolean {
    if (!order || order.estado === 'RECHAZADO') {
      return false;
    }
    const payload = this.orderPayload(order);
    return !!payload?.copyright?.hasFlag;
  }

  async rejectForCopyright(order: PedidoResumen): Promise<void> {
    const reason = prompt('Describe el motivo de rechazo por copyright');
    if (reason === null) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      alert('Debes indicar un motivo de al menos 5 caracteres.');
      return;
    }
    try {
      await firstValueFrom(this.pedidos.rejectPedido(order.id, trimmed));
      this.pushActionFeedback('success', `Pedido #${order.id} rechazado por copyright.`);
      this.selectedOrder.set(null);
      await this.inbox.refresh(false);
    } catch (err) {
      console.error('No se pudo rechazar el pedido', err);
      this.pushActionFeedback('error', 'No pudimos rechazar la solicitud.');
    }
  }

  viewDetails(order: PedidoResumen, event: Event): void {
    event.stopPropagation();
    this.selectedOrder.set(order);
  }

  orderPayload(order: PedidoResumen | null): any {
    if (!order || order.payload === null || order.payload === undefined) {
      return null;
    }
    const raw = order.payload;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw;
  }

  payloadItems(payload: any): Array<{ name: string; quantity: number; size?: string }> {
    if (!payload) {
      return [];
    }
    const items: Array<{ name: string; quantity: number; size?: string }> = [];

    const pushItem = (name: string | undefined, quantity: number | string | undefined, width?: number | string | null, height?: number | string | null, unit: string = 'cm') => {
      if (!name) return;
      const qtyNum = quantity !== null && quantity !== undefined ? Number(quantity) : NaN;
      const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.round(qtyNum) : 1;
      const widthNum = width !== null && width !== undefined ? Number(width) : undefined;
      const heightNum = height !== null && height !== undefined ? Number(height) : undefined;
      const size =
        widthNum && heightNum
          ? `${this.formatDimension(widthNum)} x ${this.formatDimension(heightNum)} ${unit}`
          : widthNum
            ? `${this.formatDimension(widthNum)} ${unit}`
            : undefined;
      items.push({
        name,
        quantity: qty,
        size
      });
    };

    if (Array.isArray(payload.items)) {
      payload.items.forEach((item: any) => {
        pushItem(
          item.displayName || item.name,
          item.quantity ?? item.qty ?? item.cantidad ?? item.count,
          item.widthCm ?? item.width ?? item.anchoCm ?? item.ancho,
          item.heightCm ?? item.height ?? item.altoCm ?? item.alto
        );
      });
    }

    if (Array.isArray(payload.quote?.items)) {
      payload.quote.items.forEach((item: any) => {
        pushItem(
          item.name,
          item.quantity ?? item.qty ?? item.cantidad ?? item.count,
          item.widthCm ?? item.width ?? item.anchoCm ?? item.ancho,
          item.heightCm ?? item.height ?? item.altoCm ?? item.alto
        );
      });
    }

    if (Array.isArray(payload.products)) {
      payload.products.forEach((item: any) => {
        pushItem(
          item.name || item.displayName,
          item.quantity ?? item.qty ?? item.cantidad ?? item.count,
          item.widthCm ?? item.width,
          item.heightCm ?? item.height
        );
      });
    }

    return items;
  }

  private resolveTotal(order: PedidoResumen): number {
    const amount = order.total ?? order.subtotal ?? 0;
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  trackByItem(_: number, item: { name: string; quantity: number; size?: string }): string {
    return `${item.name}-${item.quantity}-${item.size ?? 'no-size'}`;
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
      EN_REVISION: 'En revisi&oacute;n',
      POR_PAGAR: 'Por pagar',
      EN_PRODUCCION: 'En produccion',
      COMPLETADO: 'Completado'
    };
    return labels[estado] || estado;

  }

  async openClienteModal(order?: PedidoResumen): Promise<void> {
    const preselect = this.normalizeEmail(order?.email);
    if (preselect) {
      this.clienteSeleccionada.set(preselect);
    }
    this.clienteModalOpen.set(true);
    if (!this.clientesResumen().length) {
      await this.loadClientes();
    }
    if (preselect && !this.clienteSeleccionActual()) {
      const match = this.clientesResumen().find(cliente => this.normalizeEmail(cliente.email) === preselect);
      if (!match && !this.clientesError()) {
        this.clientesError.set('No encontramos registros para este cliente.');
      }
    }
  }

  closeClienteModal(): void {
    this.clienteModalOpen.set(false);
  }

  goToClienteInfo(order?: PedidoResumen | null): void {
    const email = this.normalizeEmail(order?.email);
    this.router.navigate(['/operador/clientes'], {
      queryParams: email
        ? { selected: email }
        : order?.id
          ? { selected: `pedido-${order.id}` }
          : undefined
    });
  }

  selectCliente(email: string | null | undefined): void {
    this.clienteSeleccionada.set(this.normalizeEmail(email));
  }

  isClienteSelected(cliente: ClientePedidosResumen): boolean {
    return this.normalizeEmail(cliente.email) === this.clienteSeleccionada();
  }

  trackByCliente(_: number, cliente: ClientePedidosResumen): string {
    return this.normalizeEmail(cliente.email) ?? `sin-email-${cliente.pedidos?.[0]?.id ?? 0}`;
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '-';
    }
    return this.currencyFormatter.format(value);
  }

  private pushActionFeedback(type: 'success' | 'error', message: string) {
    this.actionFeedback.set({ type, message });
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
    }
    this.actionTimer = setTimeout(() => {
      this.actionFeedback.set(null);
      this.actionTimer = null;
    }, 4000);
  }

  private clearActionFeedback() {
    this.actionFeedback.set(null);
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  private async loadTotals() {
    try {
      const result = await firstValueFrom(this.pedidos.getDashboardTotals());
      this.overviewTotals.set({
        day: result?.day ?? 0,
        week: result?.week ?? 0,
        month: result?.month ?? 0
      });
    } catch (err) {
      console.error('Error cargando totales del dashboard', err);
    }
  }

  private async loadFrequentClients(): Promise<void> {
    this.frequentLoading.set(true);
    this.frequentError.set(null);
    try {
      const data = await firstValueFrom(this.pedidos.listClientesResumen());
      this.clientesResumen.set(data);
      this.frequentClients.set(this.buildFrequentSummary(data));
      if (!this.clienteSeleccionada() && data.length) {
        this.clienteSeleccionada.set(this.normalizeEmail(data[0].email));
      }
    } catch (err) {
      console.error('Error cargando clientes frecuentes', err);
      this.frequentError.set('No pudimos cargar el historial de clientes frecuentes.');
    } finally {
      this.frequentLoading.set(false);
    }
  }

  private buildFrequentSummary(data: ClientePedidosResumen[]): FrequentClientSummary[] {
    return data
      .map(cliente => {
        const pedidos = (cliente.pedidos ?? []).filter(pedido => (pedido.estado || '').toUpperCase() === 'COMPLETADO');
        const total = pedidos.reduce((sum, pedido) => sum + (Number(pedido.total) || 0), 0);
        return {
          name: cliente.nombre || cliente.email || 'Cliente sin nombre',
          email: cliente.email ?? null,
          count: pedidos.length,
          total
        };
      })
      .filter(entry => entry.count > 0 || entry.total > 0)
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 5);
  }

  private async loadClientes(): Promise<void> {
    this.clientesLoading.set(true);
    this.clientesError.set(null);
    try {
      const data = await firstValueFrom(this.pedidos.listClientesResumen());
      this.clientesResumen.set(data);
      this.frequentClients.set(this.buildFrequentSummary(data));
      if (!this.clienteSeleccionada() && data.length) {
        this.clienteSeleccionada.set(this.normalizeEmail(data[0].email));
      }
    } catch (err) {
      console.error('Error cargando clientes', err);
      this.clientesError.set('No pudimos cargar la lista de clientes.');
    } finally {
      this.clientesLoading.set(false);
    }
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    return email ? email.trim().toLowerCase() : null;
  }

  private formatDimension(value: number): string {
    return Number(value).toFixed(1).replace(/\.0$/, '');
  }

  totalItemsQuantity(items: Array<{ quantity: number }>): number {
    return items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
  }
}


