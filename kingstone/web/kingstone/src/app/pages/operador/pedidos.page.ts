
import { Component, OnDestroy, OnInit, computed, effect, inject, signal, EffectRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { PedidosService, PedidoResumen, PedidoAttachment } from '../../services/pedidos.service';
import { PaymentsService } from '../../services/payments.service';

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

      <section class="orders-table" *ngIf="displayedOrders().length > 0; else emptyState">
        <div class="table-head">
          <span>Nombre de usuario</span>
          <span>Correo electronico</span>
          <span>Estado</span>
          <span>Actualizado</span>
          <span>Acciones</span>
        </div>

      <div class="table-row" *ngFor="let order of displayedOrders(); trackBy: trackById" (click)="select(order)">
          <div class="cell user">
            <div class="avatar">{{ initials(order.cliente) }}</div>
            <div>
              <strong>{{ order.cliente }}</strong>
              <small>Creado el {{ order.createdAt | date:'dd/MM/yyyy' }}</small>
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
    <div class="pagination" *ngIf="view === 'pagos' && pageCount() > 1 && orders().length">
      <button type="button" class="ghost" [disabled]="currentPage() === 1" (click)="prevPage()">Anterior</button>
      <span>Pagina {{ currentPage() }} de {{ pageCount() }}</span>
      <button type="button" class="ghost" [disabled]="currentPage() === pageCount()" (click)="nextPage()">Siguiente</button>
    </div>

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

      <section class="attachments-block">
        <h3>Archivos adjuntos</h3>
        <p class="muted" *ngIf="loadingAttachments()">Cargando archivos...</p>
        <div class="alert error" *ngIf="attachmentsError()">{{ attachmentsError() }}</div>
        <ul *ngIf="attachments().length">
          <li *ngFor="let file of attachments(); trackBy: trackByAttachment">
            <span class="file-name">{{ file.filename }}</span>
            <button
              type="button"
              class="ghost"
              [disabled]="downloadingAttachmentId() === file.id"
              (click)="downloadAttachment(file, $event)"
            >
              {{ downloadingAttachmentId() === file.id ? 'Descargando...' : 'Descargar' }}
            </button>
          </li>
        </ul>
        <p class="muted" *ngIf="!loadingAttachments() && !attachments().length && !attachmentsError()">No encontramos archivos adjuntos. Si el cliente los subio hace poco, actualiza en unos segundos.</p>
      </section>

      <section class="transfer-review" *ngIf="view === 'pagos' && transferPaymentOf(selection) as transfer">
        <header class="transfer-header">
          <h3>Transferencia reportada</h3>
          <span class="status-tag" [ngClass]="transfer.status">{{ transferStatusLabel(transfer.status) }}</span>
        </header>
        <div class="transfer-meta">
          <p><strong>Monto:</strong> {{ formatCurrency(transfer.amount || 0) }}</p>
          <p *ngIf="transfer.operationNumber"><strong>Operaci&oacute;n:</strong> {{ transfer.operationNumber }}</p>
          <p *ngIf="transfer.submittedAt || transfer.submitted_at">
            <strong>Recibido:</strong> {{ (transfer.submittedAt || transfer.submitted_at) | date:'dd/MM/yyyy HH:mm' }}
          </p>
        </div>
        <p class="muted" *ngIf="transfer.notes">{{ transfer.notes }}</p>
        <p class="muted" *ngIf="transfer.operator?.note">
          Operador: {{ transfer.operator.note }}
        </p>
        <div class="transfer-buttons">
          <button type="button" class="ghost" (click)="downloadTransferReceipt(selection, $event)" [disabled]="downloadingReceipt() || !transfer.receipt">
            {{ downloadingReceipt() ? 'Descargando...' : 'Descargar comprobante' }}
          </button>
        </div>
        <div class="alert error" *ngIf="transferActionError()">{{ transferActionError() }}</div>
        <form class="transfer-decision" *ngIf="transfer.status === 'pending'" [formGroup]="transferDecisionForm">
          <label for="transfer-note">Mensaje al cliente</label>
          <textarea id="transfer-note" rows="2" formControlName="note" placeholder="Notas para el cliente al validar el pago"></textarea>
          <div class="transfer-action-buttons">
            <button type="button" class="ghost" (click)="rejectTransfer(selection, $event)" [disabled]="transferActionLoading() === 'approve'">
              {{ transferActionLoading() === 'reject' ? 'Rechazando...' : 'Rechazar comprobante' }}
            </button>
            <button type="button" class="primary" (click)="approveTransfer(selection, $event)" [disabled]="transferActionLoading() === 'reject'">
              {{ transferActionLoading() === 'approve' ? 'Aprobando...' : 'Confirmar pago' }}
            </button>
          </div>
        </form>
      </section>

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
        <button
          type="button"
          class="ghost danger"
          *ngIf="canRejectForCopyright(selection)"
          (click)="rejectForCopyright(selection, $event)"
        >
          Rechazar por copyright
        </button>
      </div>
    </section>
  `,
  styleUrls: ['./dashboard.page.css']
})
export class OperatorOrdersPage implements OnInit, OnDestroy {
  private readonly pedidos = inject(PedidosService);
  private readonly payments = inject(PaymentsService);
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
    { value: 'listo_retiro', label: 'Listo para retiro' },
    { value: 'completado', label: 'Completado' }
  ];

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedOrder = signal<PedidoResumen | null>(null);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly attachments = signal<PedidoAttachment[]>([]);
  readonly loadingAttachments = signal(false);
  readonly attachmentsError = signal<string | null>(null);
  readonly downloadingAttachmentId = signal<number | null>(null);
  readonly pageSize = 5;
  readonly currentPage = signal(1);
  readonly pageCount = computed(() => {
    if (this.view !== 'pagos') {
      return 1;
    }
    const total = this.orders().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });
  readonly displayedOrders = computed(() => {
    const ordered = this.orders();
    if (this.view !== 'pagos') {
      return ordered;
    }
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return ordered.slice(start, start + this.pageSize);
  });

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
  readonly transferDecisionForm = this.fb.group({
    note: ['']
  });

  readonly creatingWorkOrder = signal(false);
  readonly updatingWorkOrder = signal(false);
  readonly workOrderError = signal<string | null>(null);
  readonly transferActionLoading = signal<'approve' | 'reject' | null>(null);
  readonly transferActionError = signal<string | null>(null);
  readonly downloadingReceipt = signal(false);

  private paramsSub?: Subscription;
  private attachmentsRequestToken = 0;

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
  private readonly paginationEffect: EffectRef = effect(() => {
    if (this.view !== 'pagos') {
      this.currentPage.set(1);
      return;
    }
    const max = this.pageCount();
    if (this.currentPage() > max) {
      this.currentPage.set(max);
    }
  });

  ngOnInit(): void {
    this.refresh();
    this.paramsSub = this.route.queryParamMap.subscribe(() => this.applySelectionFromQuery());
  }

  ngOnDestroy(): void {
    this.paramsSub?.unsubscribe();
    this.paginationEffect.destroy();
  }

  refresh(): void {
    this.actionFeedback.set(null);
    this.workOrderError.set(null);
    this.creatingWorkOrder.set(false);
    this.updatingWorkOrder.set(false);
    if (this.view === 'pagos') {
      this.currentPage.set(1);
    }
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
        const [pendientes, enRevision] = await Promise.all([
          firstValueFrom(this.pedidos.listByStatus('PENDIENTE')),
          firstValueFrom(this.pedidos.listByStatus('EN_REVISION'))
        ]);
        const merged = new Map<number, PedidoResumen>();
        for (const list of [pendientes, enRevision]) {
          list?.forEach(item => merged.set(item.id, item));
        }
        data = Array.from(merged.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
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
    this.transferDecisionForm.reset({ note: '' });
    this.transferActionError.set(null);
    this.transferActionLoading.set(null);
    void this.loadAttachments(order.id);
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
    this.transferDecisionForm.reset({ note: '' });
    this.transferActionError.set(null);
    this.transferActionLoading.set(null);
    this.resetAttachmentsState();
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

  canRejectForCopyright(order: PedidoResumen | null): boolean {
    if (!order || order.estado === 'RECHAZADO') {
      return false;
    }
    const payload = this.orderPayload(order);
    return !!payload?.copyright?.hasFlag;
  }

  async rejectForCopyright(order: PedidoResumen, event?: Event): Promise<void> {
    event?.stopPropagation();
    const reason = prompt('Describe el motivo del rechazo por copyright (minimo 5 caracteres)');
    if (reason === null) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      alert('Debes escribir un motivo de al menos 5 caracteres.');
      return;
    }
    try {
      await firstValueFrom(this.pedidos.rejectPedido(order.id, trimmed));
      this.actionFeedback.set({
        type: 'success',
        message: `Pedido #${order.id} rechazado por copyright.`
      });
      this.orders.update(items => items.filter(item => item.id !== order.id));
      this.closeDetail();
    } catch (err) {
      console.error('No se pudo rechazar el pedido', err);
      this.actionFeedback.set({
        type: 'error',
        message: 'No logramos rechazar el pedido. Intenta nuevamente.'
      });
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

  trackByAttachment(_: number, item: PedidoAttachment): number {
    return item.id;
  }

  async downloadAttachment(file: PedidoAttachment, event?: Event): Promise<void> {
    event?.stopPropagation();
    const order = this.selectedOrder();
    if (!order) {
      return;
    }
    this.downloadingAttachmentId.set(file.id);
    try {
      const blob = await firstValueFrom(this.pedidos.downloadAttachment(order.id, file.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename || `pedido-${order.id}-archivo-${file.id}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('No se pudo descargar el archivo adjunto', err);
      this.actionFeedback.set({ type: 'error', message: 'No pudimos descargar el archivo adjunto.' });
    } finally {
      this.downloadingAttachmentId.set(null);
    }
  }

  private async loadAttachments(pedidoId: number): Promise<void> {
    if (!pedidoId) {
      this.resetAttachmentsState();
      return;
    }
    const requestId = ++this.attachmentsRequestToken;
    this.loadingAttachments.set(true);
    this.attachmentsError.set(null);
    this.attachments.set([]);
    try {
      const files = await firstValueFrom(this.pedidos.listAttachments(pedidoId));
      if (requestId === this.attachmentsRequestToken) {
        this.attachments.set(Array.isArray(files) ? files : []);
      }
    } catch (err) {
      console.error('No se pudieron cargar los archivos adjuntos', err);
      if (requestId === this.attachmentsRequestToken) {
        this.attachmentsError.set('No pudimos cargar los archivos adjuntos.');
      }
    } finally {
      if (requestId === this.attachmentsRequestToken) {
        this.loadingAttachments.set(false);
      }
    }
  }

  private resetAttachmentsState(): void {
    this.attachmentsRequestToken++;
    this.attachments.set([]);
    this.attachmentsError.set(null);
    this.loadingAttachments.set(false);
    this.downloadingAttachmentId.set(null);
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

  transferPaymentOf(order: PedidoResumen | null): any {
    const payload = this.orderPayload(order);
    return payload?.transferPayment ?? null;
  }

  transferStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Confirmado',
      rejected: 'Rechazado'
    };
    return map[status] || status;
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
      listo_retiro: 'Listo para retiro',
      completado: 'Completado'
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
    const normalized = (stage || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    if (normalized === 'COLA' || normalized === 'PRODUCCION' || normalized === 'CONTROL_CALIDAD') {
      return 'EN_IMPRESION';
    }
    if (normalized === 'LISTO_RETIRO') {
      return 'EN_PRODUCCION';
    }
    if (normalized === 'COMPLETADO') {
      return 'COMPLETADO';
    }
    return null;
  }

  private formatDimension(value: number): string {
    return Number(value).toFixed(1).replace(/\.0$/, '');
  }

  async downloadTransferReceipt(order: PedidoResumen, event?: Event): Promise<void> {
    event?.stopPropagation();
    this.downloadingReceipt.set(true);
    try {
      const blob = await firstValueFrom(this.payments.downloadTransferReceipt(order.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transferencia-${order.id}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('No se pudo descargar comprobante de transferencia', err);
      this.actionFeedback.set({ type: 'error', message: 'No pudimos descargar el comprobante.' });
    } finally {
      this.downloadingReceipt.set(false);
    }
  }

  approveTransfer(order: PedidoResumen, event?: Event): void {
    event?.stopPropagation();
    void this.handleTransferDecision(order, 'approve');
  }

  rejectTransfer(order: PedidoResumen, event?: Event): void {
    event?.stopPropagation();
    void this.handleTransferDecision(order, 'reject');
  }

  private async handleTransferDecision(order: PedidoResumen, action: 'approve' | 'reject'): Promise<void> {
    this.transferActionLoading.set(action);
    this.transferActionError.set(null);
    try {
      const note = this.transferDecisionForm.value.note?.trim() || undefined;
      const updated = await firstValueFrom(
        this.payments.reviewTransfer(order.id, action, note)
      );
      const refreshed: PedidoResumen = {
        ...order,
        estado: (updated as any)?.estado ?? order.estado,
        payload: (updated as any)?.payload ?? order.payload
      };
      this.orders.update(items => items.map(item => (item.id === order.id ? refreshed : item)));
      this.selectedOrder.set(refreshed);
      this.transferDecisionForm.reset({ note: '' });
      const message =
        action === 'approve'
          ? `Pedido #${order.id} confirmado por transferencia.`
          : `Comprobante del pedido #${order.id} rechazado.`;
      this.actionFeedback.set({ type: 'success', message });
    } catch (err: any) {
      console.error('No se pudo actualizar la transferencia', err);
      const message = err?.error?.message || 'No pudimos actualizar la transferencia.';
      this.transferActionError.set(message);
    } finally {
      this.transferActionLoading.set(null);
    }
  }

  private setPage(page: number): void {
    if (this.view !== 'pagos') {
      return;
    }
    const target = Math.min(Math.max(page, 1), this.pageCount());
    this.currentPage.set(target);
  }

  nextPage(): void {
    this.setPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.setPage(this.currentPage() - 1);
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
        void this.loadAttachments(match.id);
        return;
      }
      if (!forceFirst) {
        this.selectedOrder.set(null);
        this.prepareWorkOrderForms(null);
        this.resetAttachmentsState();
        return;
      }
    }
    if (forceFirst && this.orders().length) {
      const first = this.orders()[0];
      this.selectedOrder.set(first);
      this.prepareWorkOrderForms(first);
      void this.loadAttachments(first.id);
    } else if (!this.orders().length) {
      this.selectedOrder.set(null);
      this.prepareWorkOrderForms(null);
      this.resetAttachmentsState();
    }
  }
}
