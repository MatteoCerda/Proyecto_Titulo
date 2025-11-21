import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonSpinner } from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth.service';
import { ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PedidosService, PedidoResumen, PedidoAttachment } from '../../services/pedidos.service';
import { PaymentsService, TransferBankInfo } from '../../services/payments.service';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [CommonModule, IonContent, IonItem, IonLabel, IonInput, IonButton, IonSpinner, ReactiveFormsModule, DatePipe, CurrencyPipe],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss']
})
export class ProfilePage {
  private fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private toast = inject(ToastController);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private pedidos = inject(PedidosService);
  private payments = inject(PaymentsService);

  loading = signal(false);
  // Navegación lateral
  tab = signal<'datos' | 'pedidos'>('datos');
  // Solo clientes ven "Mis pedidos"
  isClient = signal(true);
  // Estado de pedidos
  orders = signal<PedidoResumen[]>([]);
  loadingOrders = signal(false);
  errorOrders = signal<string | null>(null);
  expandedId = signal<number | null>(null);
  payingOrderId = signal<number | null>(null);
  form = this.fb.group({
    email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
    fullName: ['', [Validators.required, Validators.minLength(2)]],
  });
  clientForm = this.fb.group({
    rut: [''],
    nombre_contacto: [''],
    telefono: [''],
    direccion: [''],
    comuna: [''],
    ciudad: [''],
  });
  passForm = this.fb.group({
    currentPassword: ['', [Validators.required, Validators.minLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmNewPassword: ['', [Validators.required, Validators.minLength(6)]],
  });
  transferInfo = signal<TransferBankInfo | null>(null);
  transferModalOpen = signal(false);
  transferSubmitting = signal(false);
  transferError = signal<string | null>(null);
  transferFile = signal<File | null>(null);
  transferTarget = signal<PedidoResumen | null>(null);
  transferForm = this.fb.group({
    amount: ['', [Validators.required, Validators.min(1000)]],
    transferDate: [''],
    notes: ['']
  });

  async ngOnInit() {
    // Determina rol actual
    const role = this.auth.getRole();
    this.isClient.set((role || 'CLIENT').toUpperCase() === 'CLIENT');
    this.loading.set(true);
    try {
      const me = await this.auth.getMe();
      this.form.patchValue({ email: me?.email || this.auth.getEmail(), fullName: me?.fullName || '' });
      const profile = await this.auth.getClientProfile();
      if (profile) {
        this.clientForm.patchValue({
          rut: profile.rut || '',
          nombre_contacto: profile.nombre_contacto || this.form.value.fullName || '',
          telefono: profile.telefono || '',
          direccion: profile.direccion || '',
          comuna: profile.comuna || '',
          ciudad: profile.ciudad || '',
        });
      }
    } finally {
      this.loading.set(false);
    }
    // Cargar pedidos solo si es cliente
    if (this.isClient()) {
      this.refreshOrders();
    }
    // Seleccionar pestaña por query param
    this.route.queryParamMap.subscribe(q => {
      const t = q.get('tab');
      if (t === 'pedidos' && this.isClient()) this.tab.set('pedidos');
      else this.tab.set('datos');
    });
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { fullName } = this.form.getRawValue();
      await this.auth.updateProfile(fullName!);
      const profile = this.clientForm.value;
      await this.auth.updateClientProfile({
        rut: profile.rut || undefined,
        // Si no especifica nombre de contacto, usamos el nombre completo
        nombre_contacto: (profile.nombre_contacto && profile.nombre_contacto.trim().length > 0)
          ? profile.nombre_contacto
          : (fullName || undefined),
        telefono: profile.telefono || undefined,
        direccion: profile.direccion || undefined,
        comuna: profile.comuna || undefined,
        ciudad: profile.ciudad || undefined,
      });
      const t = await this.toast.create({
        message: 'Perfil actualizado',
        duration: 2000,
        position: 'top',
        color: 'success'
      });
      await t.present();
    } catch (e: any) {
      const msg = e?.error?.message || 'No se pudieron actualizar los datos';
      const t = await this.toast.create({ message: msg, duration: 2500, position: 'top', color: 'danger' });
      await t.present();
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmitPassword() {
    if (this.passForm.invalid) return;
    const { currentPassword, newPassword, confirmNewPassword } = this.passForm.value;
    if (newPassword !== confirmNewPassword) {
      const t = await this.toast.create({ message: 'Las contraseñas no coinciden', duration: 2000, position: 'top', color: 'warning' });
      await t.present();
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.updatePassword(currentPassword!, newPassword!);
      const t = await this.toast.create({ message: 'Contraseña actualizada', duration: 2000, position: 'top', color: 'success' });
      await t.present();
      this.passForm.reset();
    } catch (e: any) {
      const msg = e?.error?.message || 'No se pudo actualizar la contraseña';
      const t = await this.toast.create({ message: msg, duration: 2500, position: 'top', color: 'danger' });
      await t.present();
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async refreshOrders() {
    this.loadingOrders.set(true);
    try {
      const data = await firstValueFrom(this.pedidos.listMine());
      this.orders.set(data || []);
      this.errorOrders.set(null);
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.error?.message;
      if (status === 401) this.errorOrders.set('Debes iniciar sesión para ver tus pedidos.');
      else if (status === 403) this.errorOrders.set('Tu cuenta no tiene permisos para ver esta información.');
      else this.errorOrders.set(msg || 'No pudimos cargar tus pedidos.');
    } finally {
      this.loadingOrders.set(false);
    }
  }

  private async loadTransferInfo() {
    try {
      const info = await firstValueFrom(this.payments.getTransferInfo());
      this.transferInfo.set(info);
    } catch {
      this.transferInfo.set(null);
    }
  }

  toggleOrder(id: number) { this.expandedId.set(this.expandedId() === id ? null : id); }

  private payloadOf(order: PedidoResumen): any {
    if (!order?.payload) {
      return {};
    }
    if (typeof order.payload === 'string') {
      try {
        return JSON.parse(order.payload);
      } catch {
        return {};
      }
    }
    return order.payload;
  }

  productsOf(order: PedidoResumen) {
    return this.payloadOf(order)?.products ?? [];
  }

  quoteItemsOf(order: PedidoResumen) {
    return this.payloadOf(order)?.quote?.items ?? [];
  }

  attachmentsOf(order: PedidoResumen): PedidoAttachment[] {
    return this.payloadOf(order)?.attachments ?? [];
  }

  totalsOf(order: PedidoResumen) {
    const payload = this.payloadOf(order);
    return {
      area: payload?.filesTotalAreaCm2 ?? null,
      length: payload?.filesTotalLengthCm ?? null,
      price: payload?.filesTotalPrice ?? null,
    };
  }

  totalAmountOf(order: PedidoResumen): number | null {
    if (typeof order.total === 'number') {
      return order.total;
    }
    if (typeof order.subtotal === 'number') {
      return order.subtotal;
    }
    return this.totalsOf(order).price ?? null;
  }

  materialOf(order: PedidoResumen): string | null {
    return order.materialLabel || this.payloadOf(order)?.quote?.materialLabel || null;
  }

  mainItemOf(order: PedidoResumen) {
    const products = this.productsOf(order);
    if (products.length) {
      const first = products[0];
      return {
        name: first.name || 'Producto del catalogo',
        detail: `${first.quantity ?? 0} unidades`,
      };
    }
    const quoteItems = this.quoteItemsOf(order);
    if (quoteItems.length) {
      const first = quoteItems[0];
      const size =
        first.widthCm && first.heightCm ? `${first.widthCm} x ${first.heightCm} cm` : null;
      return {
        name: first.name || 'Pedido personalizado',
        detail: `${first.quantity ?? 1} piezas${size ? ` · ${size}` : ''}`,
      };
    }
    return null;
  }

  readyDateOf(order: PedidoResumen): string | null {
    return order.workOrder?.programadoPara ?? order.workOrder?.terminaEn ?? null;
  }

  readyStageLabel(order: PedidoResumen): string | null {
    const map: Record<string, string> = {
      cola: 'Recibido',
      produccion: 'En produccion',
      control_calidad: 'Control de calidad',
      listo_retiro: 'Listo para retiro',
      completado: 'Entregado',
    };
    const key = order.workOrder?.estado;
    if (!key) {
      return null;
    }
    return map[key] || key;
  }

  noteOf(order: PedidoResumen): string | null {
    return order.note || this.payloadOf(order)?.note || null;
  }

  operatorDecisionOf(order: PedidoResumen): { reason: string; decidedAt: string | null } | null {
    const decision = this.payloadOf(order)?.operatorDecision;
    if (decision?.reason) {
      return {
        reason: decision.reason,
        decidedAt: decision.decidedAt ?? null
      };
    }
    return null;
  }

  transferPaymentOf(order: PedidoResumen): any {
    return this.payloadOf(order)?.transferPayment ?? null;
  }

  transferStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente de validación',
      approved: 'Pago confirmado',
      rejected: 'Comprobante rechazado'
    };
    return map[status] || status;
  }

  transferStatusClass(status: string): string {
    switch (status) {
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  }

  transferSubmittedAt(transfer: any): string | null {
    const value = transfer?.submittedAt ?? transfer?.submitted_at ?? null;
    return typeof value === 'string' ? value : null;
  }

  openTransferModal(order: PedidoResumen): void {
    this.transferTarget.set(order);
    const presetAmount = this.totalAmountOf(order);
    this.transferForm.reset({
      amount: presetAmount ? String(presetAmount) : '',
      transferDate: '',
      notes: ''
    });
    this.transferFile.set(null);
    this.transferError.set(null);
    this.transferModalOpen.set(true);
  }

  closeTransferModal(): void {
    this.transferModalOpen.set(false);
    this.transferTarget.set(null);
    this.transferFile.set(null);
    this.transferForm.reset({
      amount: '',
      transferDate: '',
      notes: ''
    });
    this.transferError.set(null);
  }

  onTransferFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0] ?? null;
    this.transferFile.set(file);
  }

  private normalizeDateTimeInput(value?: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  async submitTransferNotification(): Promise<void> {
    if (this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }
    const order = this.transferTarget();
    if (!order) {
      return;
    }
    const value = this.transferForm.value;
    const formData = new FormData();
    formData.append('pedidoId', String(order.id));
    formData.append('amount', String(value.amount));
    const isoDate = this.normalizeDateTimeInput(value.transferDate);
    if (isoDate) {
      formData.append('transferDate', isoDate);
    }
    if (value.notes?.trim()) {
      formData.append('notes', value.notes.trim());
    }
    if (this.transferFile()) {
      formData.append('receipt', this.transferFile() as File);
    }
    this.transferSubmitting.set(true);
    this.transferError.set(null);
    try {
      await firstValueFrom(this.payments.notifyTransfer(formData));
      const t = await this.toast.create({
        message: 'Gracias, estamos validando tu transferencia.',
        duration: 2500,
        position: 'top',
        color: 'success'
      });
      await t.present();
      this.closeTransferModal();
      await this.refreshOrders();
    } catch (err: any) {
      console.error('transfer notify error', err);
      const message = err?.error?.message || 'No pudimos registrar tu comprobante.';
      this.transferError.set(message);
    } finally {
      this.transferSubmitting.set(false);
    }
  }

  formatCurrency(value?: number | null): string {
    if (value == null) return '-';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
  }

  labelEstado(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      EN_REVISION: 'En revision',
      POR_PAGAR: 'Por pagar',
      EN_PRODUCCION: 'En produccion',
      COMPLETADO: 'Completado',
    };
    return labels[estado] || estado;
  }

  readyPickupLabel(order: PedidoResumen): string | null {
    if ((order.estado || '').toUpperCase() !== 'LISTO_RETIRO') {
      return null;
    }
    const pickupDate = this.readyDateOf(order);
    if (!pickupDate) {
      return 'Retiro disponible en el taller';
    }
    const formatted = new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(pickupDate));
    return `Retiro disponible el ${formatted}`;
  }

  canPay(order: PedidoResumen): boolean {
    const state = (order.estado || '').toUpperCase();
    if (!['POR_PAGAR', 'EN_REVISION'].includes(state)) {
      return false;
    }
    const transfer = this.transferPaymentOf(order);
    if (transfer && transfer.status === 'pending') {
      return false;
    }
    return true;
  }

  isPaying(order: PedidoResumen): boolean {
    return this.payingOrderId() === order.id;
  }

  async payOrder(order: PedidoResumen) {
    if (!order?.id) return;
    this.payingOrderId.set(order.id);
    try {
      const response = await firstValueFrom(
        this.payments.createTransaction({ pedidoId: order.id })
      );
      if (!response?.url || !response?.token) {
        throw new Error('No recibimos un token o URL de Webpay.');
      }
      this.submitWebpayForm(response.url, response.token);
    } catch (error: any) {
      const msg = error?.error?.message || error?.message || 'No pudimos iniciar el pago.';
      const t = await this.toast.create({
        message: msg,
        duration: 2500,
        position: 'top',
        color: 'danger',
      });
      await t.present();
    } finally {
      this.payingOrderId.set(null);
    }
  }

  private submitWebpayForm(url: string, token: string) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token;
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  }

  canDownloadReceipt(order: PedidoResumen): boolean {
    return !!order.receiptAvailable;
  }

  async downloadReceipt(order: PedidoResumen): Promise<void> {
    try {
      const blob = await firstValueFrom(this.pedidos.downloadReceipt(order.id));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `boleta-${order.id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo descargar la boleta', error);
    }
  }

  select(tab: 'datos' | 'pedidos') {
    if (tab === 'pedidos' && !this.isClient()) {
      this.tab.set('datos');
      return;
    }
    this.tab.set(tab);
    // Mantener URL en sincronía
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge' });
  }
}



