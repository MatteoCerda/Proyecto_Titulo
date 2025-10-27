
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { PedidosService, PedidoResumen } from '../../services/pedidos.service';

@Component({
  standalone: true,
  selector: 'app-operator-orders',
  imports: [CommonModule, DatePipe, ReactiveFormsModule],
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
            <button type="button" class="primary" *ngIf="view === 'cotizaciones'" (click)="sendToPayments(order, $event)">
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
        <h3>Pedido en revision</h3>
        <p>Valida cantidades, materiales y comentarios antes de enviarlo a la etapa de pago.</p>
      </div>
      <div class="payments-banner" *ngIf="selection.estado === 'POR_PAGAR'">
        <h3>Pedido por pagar</h3>
        <p>Comparte el enlace de pago con el cliente y espera la confirmacion antes de producir.</p>
      </div>
      <ul>
        <li><span>ID pedido</span><strong>#{{ selection.id }}</strong></li>
        <li><span>Cliente</span><strong>{{ selection.cliente }}</strong></li>
        <li><span>Correo</span><strong>{{ selection.email }}</strong></li>
        <li><span>Estado</span><strong>{{ labelEstado(selection.estado) }}</strong></li>
        <li><span>Actualizado</span><strong>{{ selection.createdAt | date:'medium' }}</strong></li>
        <li>
          <span>Total estimado</span>
          <strong>{{ selection.total !== null && selection.total !== undefined ? formatCurrency(selection.total) : 'Por definir' }}</strong>
        </li>
        <li><span>Nro de items</span><strong>{{ selection.items || '-' }}</strong></li>
        <li><span>Material</span><strong>{{ selection.materialLabel || 'Por definir' }}</strong></li>
      </ul>
      <div class="note-block" *ngIf="selection.note">
        <h3>Notas del cliente</h3>
        <p>{{ selection.note }}</p>
      </div>
      <ng-container *ngIf="orderPayload(selection) as payload">
        <div class="note-block" *ngIf="!selection.note && payload?.note">
          <h3>Notas del cliente</h3>
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

      <section class="work-order-section" *ngIf="view === 'pagos'">
        <ng-container *ngIf="selection.workOrder as workOrder; else createWorkOrderTpl">
          <header class="work-order-header">
            <h3>Orden de trabajo</h3>
            <span class="wo-stage-tag">{{ stageLabel(workOrder.estado) }}</span>
          </header>
          <form [formGroup]="editWorkOrderForm" (ngSubmit)="submitWorkOrderUpdate()" class="work-order-form">
            <div class="form-row">
              <label for="wo-estado">Etapa</label>
              <select id="wo-estado" formControlName="estado">
                <option *ngFor="let stage of workOrderStages" [value]="stage.value">{{ stage.label }}</option>
              </select>
            </div>
            <div class="form-row">
              <label for="wo-maquina">Maquina / tecnica</label>
              <input id="wo-maquina" type="text" formControlName="maquina" />
            </div>
            <div class="form-row">
              <label for="wo-programado">Programado para</label>
              <input id="wo-programado" type="datetime-local" formControlName="programadoPara" />
            </div>
            <div class="form-row">
              <label for="wo-notas">Notas internas</label>
              <textarea id="wo-notas" rows="2" formControlName="notas"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="primary" [disabled]="editWorkOrderForm.invalid || updatingWorkOrder()">Actualizar OT</button>
              <span class="muted" *ngIf="updatingWorkOrder()">Actualizando...</span>
            </div>
            <div class="form-error" *ngIf="workOrderError()">{{ workOrderError() }}</div>
          </form>
        </ng-container>
        <ng-template #createWorkOrderTpl>
          <h3>Crear orden de trabajo</h3>
          <p>Asigna tecnica, maquina y agenda este pedido para producirlo.</p>
          <form [formGroup]="createWorkOrderForm" (ngSubmit)="submitWorkOrderCreation()" class="work-order-form">
            <div class="form-row">
              <label for="ot-tecnica">Tecnica</label>
              <select id="ot-tecnica" formControlName="tecnica">
                <option value="">Selecciona una tecnica</option>
                <option value="DTF_TEXTIL">DTF textil</option>
                <option value="DTF_UV">DTF UV</option>
                <option value="VINILO_CORTE">Corte de vinilo</option>
                <option value="PVC_TELA">Impresion en tela PVC</option>
                <option value="OTRA">Otra tecnica</option>
              </select>
            </div>
            <div class="form-row">
              <label for="ot-maquina">Maquina / equipo</label>
              <input id="ot-maquina" type="text" formControlName="maquina" placeholder="Nombre o codigo de maquina" />
            </div>
            <div class="form-row">
              <label for="ot-programado">Programado para</label>
              <input id="ot-programado" type="datetime-local" formControlName="programadoPara" />
            </div>
            <div class="form-row">
              <label for="ot-notas">Notas internas</label>
              <textarea id="ot-notas" rows="2" formControlName="notas" placeholder="Observaciones para produccion"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="primary" [disabled]="createWorkOrderForm.invalid || creatingWorkOrder()">Crear OT</button>
              <span class="muted" *ngIf="creatingWorkOrder()">Creando...</span>
            </div>
            <div class="form-error" *ngIf="workOrderError()">{{ workOrderError() }}</div>
          </form>
        </ng-template>
      </section>

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
  private readonly fb = inject(FormBuilder);
  private readonly currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  readonly workOrderStages = [
    { value: 'cola', label: 'En cola' },
    { value: 'produccion', label: 'En produccion' },
    { value: 'control_calidad', label: 'Control de calidad' },
    { value: 'listo_retiro', label: 'Listo para retiro' }
  ];

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedOrder = signal<PedidoResumen | null>(null);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly createWorkOrderForm = this.fb.group({
    tecnica: ['', Validators.required],
    maquina: [''],
    programadoPara: [''],
    notas: ['']
  });

  readonly editWorkOrderForm = this.fb.group({
    estado: ['', Validators.required],
    maquina: [''],
    programadoPara: [''],
    notas: ['']
  });

  readonly creatingWorkOrder = signal(false);
  readonly updatingWorkOrder = signal(false);
  readonly workOrderError = signal<string | null>(null);

  private paramsSub?: Subscription;

  readonly view: 'cotizaciones' | 'pagos' =
    (this.route.snapshot.data['view'] as string) === 'pagos' ? 'pagos' : 'cotizaciones';

  readonly title = computed(() =>
    this.view === 'pagos' ? 'Pedidos por pagar' : 'Cotizaciones en revision'
  );

  readonly description = computed(() =>
    this.view === 'pagos'
      ? 'Gestiona los pedidos listos para pago y coordina la produccion.'
      : 'Revisa las solicitudes tomadas por el equipo antes de enviarlas a pago.'
  );

  ngOnInit(): void {
    this.refresh();
    this.paramsSub = this.route.queryParamMap.subscribe(() => this.applySelectionFromQuery());
  }

  ngOnDestroy(): void {
    this.paramsSub?.unsubscribe();
  }

  refresh(): void {
    this.actionFeedback.set(null);
    this.workOrderError.set(null);
    this.creatingWorkOrder.set(false);
    this.updatingWorkOrder.set(false);
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      let data: PedidoResumen[] = [];
      if (this.view === 'pagos') {
        const [porPagar, enImpresion, enProduccion] = await Promise.all([
          firstValueFrom(this.pedidos.listByStatus('POR_PAGAR')),
          firstValueFrom(this.pedidos.listByStatus('EN_IMPRESION')),
          firstValueFrom(this.pedidos.listByStatus('EN_PRODUCCION'))
        ]);
        const merged = new Map<number, PedidoResumen>();
        for (const list of [porPagar, enImpresion, enProduccion]) {
          list?.forEach(item => merged.set(item.id, item));
        }
        data = Array.from(merged.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else {
        data = await firstValueFrom(this.pedidos.listByStatus('EN_REVISION'));
      }
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
    this.prepareWorkOrderForms(order);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { selected: order.id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
    this.prepareWorkOrderForms(null);
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
      this.closeDetail();
      this.router.navigate(['/operador/pagos'], { queryParams: { selected: order.id } });
    } catch (err) {
      console.error('No se pudo enviar a pagos', err);
      this.actionFeedback.set({ type: 'error', message: 'No logramos mover el pedido a pagos.' });
    }
  }

  async submitWorkOrderCreation(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) {
      return;
    }
    if (this.createWorkOrderForm.invalid) {
      this.createWorkOrderForm.markAllAsTouched();
      return;
    }
    const value = this.createWorkOrderForm.value;
    this.creatingWorkOrder.set(true);
    this.workOrderError.set(null);
    try {
      const payload: any = {
        tecnica: value.tecnica!,
        maquina: value.maquina?.trim() ? value.maquina.trim() : null,
        notas: value.notas?.trim() ? value.notas.trim() : null
      };
      if (value.programadoPara) {
        payload.programadoPara = this.normalizeDateTimeValue(value.programadoPara);
      }
      const created = await firstValueFrom(this.pedidos.createWorkOrder(order.id, payload));
      const updatedOrder: PedidoResumen = { ...order, estado: 'EN_IMPRESION', workOrder: created };
      this.orders.update(list => list.map(item => (item.id === order.id ? updatedOrder : item)));
      this.selectedOrder.set(updatedOrder);
      this.prepareWorkOrderForms(updatedOrder);
      this.actionFeedback.set({ type: 'success', message: 'Orden de trabajo creada.' });
    } catch (err) {
      console.error('No se pudo crear la orden de trabajo', err);
      this.workOrderError.set('No logramos crear la orden de trabajo. Intenta nuevamente.');
    } finally {
      this.creatingWorkOrder.set(false);
    }
  }

  async submitWorkOrderUpdate(): Promise<void> {
    const order = this.selectedOrder();
    const workOrder = order?.workOrder;
    if (!order || !workOrder || this.editWorkOrderForm.invalid) {
      this.editWorkOrderForm.markAllAsTouched();
      return;
    }
    const value = this.editWorkOrderForm.value;
    this.updatingWorkOrder.set(true);
    this.workOrderError.set(null);
    try {
      const payload: any = {
        estado: value.estado,
        maquina: value.maquina?.trim() ? value.maquina.trim() : null,
        notas: value.notas?.trim() ? value.notas.trim() : null
      };
      if (typeof value.programadoPara === 'string') {
        payload.programadoPara = value.programadoPara
          ? this.normalizeDateTimeValue(value.programadoPara)
          : null;
      }
      const updated = await firstValueFrom(this.pedidos.updateWorkOrder(workOrder.id, payload));
      const nextEstado = this.derivePedidoEstadoFromStage(updated.estado) ?? order.estado;
      const updatedOrder: PedidoResumen = { ...order, estado: nextEstado, workOrder: updated };
      this.orders.update(list => list.map(item => (item.id === order.id ? updatedOrder : item)));
      this.selectedOrder.set(updatedOrder);
      this.prepareWorkOrderForms(updatedOrder);
      this.actionFeedback.set({ type: 'success', message: 'Orden de trabajo actualizada.' });
    } catch (err) {
      console.error('No se pudo actualizar la orden de trabajo', err);
      this.workOrderError.set('No pudimos actualizar la orden. Revisa los datos e intenta de nuevo.');
    } finally {
      this.updatingWorkOrder.set(false);
    }
  }

  trackById(_: number, item: PedidoResumen): number {
    return item.id;
  }

  trackByItem(_: number, item: { name: string; quantity: number; size?: string }): string {
    return `${item.name}-${item.quantity}-${item.size ?? 'no-size'}`;
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

    const pushItem = (
      name: string | undefined,
      quantity: number | string | undefined,
      width?: number | string | null,
      height?: number | string | null,
      unit: string = 'cm'
    ) => {
      if (!name) {
        return;
      }
      const qtyNumber = quantity !== null && quantity !== undefined ? Number(quantity) : NaN;
      const qty = Number.isFinite(qtyNumber) && qtyNumber > 0 ? Math.round(qtyNumber) : 1;
      const widthNumber = width !== null && width !== undefined ? Number(width) : undefined;
      const heightNumber = height !== null && height !== undefined ? Number(height) : undefined;
      const size =
        widthNumber && heightNumber
          ? `${this.formatDimension(widthNumber)} x ${this.formatDimension(heightNumber)} ${unit}`
          : widthNumber
            ? `${this.formatDimension(widthNumber)} ${unit}`
            : undefined;
      items.push({ name, quantity: qty, size });
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

  totalItemsQuantity(items: Array<{ quantity: number }>): number {
    return items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '-';
    }
    return this.currencyFormatter.format(value);
  }

  stageLabel(stage: string): string {
    const map: Record<string, string> = {
      cola: 'En cola',
      produccion: 'En produccion',
      control_calidad: 'Control de calidad',
      listo_retiro: 'Listo para retiro'
    };
    return map[stage] || stage;
  }

  private prepareWorkOrderForms(order: PedidoResumen | null): void {
    this.workOrderError.set(null);
    if (order?.workOrder) {
      const wo = order.workOrder;
      this.editWorkOrderForm.setValue({
        estado: wo.estado || 'cola',
        maquina: wo.maquina || '',
        programadoPara: wo.programadoPara ? this.toDateTimeLocalValue(wo.programadoPara) : '',
        notas: wo.notas || ''
      });
      this.createWorkOrderForm.reset({
        tecnica: '',
        maquina: '',
        programadoPara: '',
        notas: ''
      });
    } else {
      this.createWorkOrderForm.reset({
        tecnica: '',
        maquina: '',
        programadoPara: '',
        notas: ''
      });
      this.editWorkOrderForm.reset({
        estado: 'cola',
        maquina: '',
        programadoPara: '',
        notas: ''
      });
    }
  }

  private normalizeDateTimeValue(value: string): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toISOString();
  }

  private toDateTimeLocalValue(value: string): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  }

  private derivePedidoEstadoFromStage(stage: string): string | null {
    const normalized = (stage || '').toUpperCase();
    if (normalized === 'COLA' || normalized === 'PRODUCCION' || normalized === 'PRODUCCIÓN' || normalized === 'CONTROL_CALIDAD') {
      return 'EN_IMPRESION';
    }
    if (normalized === 'LISTO_RETIRO') {
      return 'EN_PRODUCCION';
    }
    return null;
  }

  private formatDimension(value: number): string {
    return Number(value).toFixed(1).replace(/\.0$/, '');
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
        this.prepareWorkOrderForms(match);
        return;
      }
      if (!forceFirst) {
        this.selectedOrder.set(null);
        this.prepareWorkOrderForms(null);
        return;
      }
    }
    if (forceFirst && this.orders().length) {
      const first = this.orders()[0];
      this.selectedOrder.set(first);
      this.prepareWorkOrderForms(first);
    } else if (!this.orders().length) {
      this.selectedOrder.set(null);
      this.prepareWorkOrderForms(null);
    }
  }
}
