import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PedidosService, PedidoResumen, PedidoAttachment } from '../../services/pedidos.service';

interface PedidoPayload {
  attachments?: PedidoAttachment[];
  filesTotalAreaCm2?: number;
  filesTotalLengthCm?: number;
  filesTotalPrice?: number;
  note?: string;
}

@Component({
  standalone: true,
  selector: 'app-metodos-pago',
  imports: [CommonModule, IonContent, IonButton, DatePipe, RouterLink],
  templateUrl: './metodos-pago.page.html',
  styleUrls: ['./metodos-pago.page.scss']
})
export class MetodosPagoPage implements OnInit {
  private readonly pedidos = inject(PedidosService);

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly uploadingId = signal<number | null>(null);

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

  payloadOf(order: PedidoResumen): PedidoPayload {
    if (order?.payload && typeof order.payload === 'object') {
      return order.payload as PedidoPayload;
    }
    try {
      return JSON.parse(order?.payload ?? '{}') as PedidoPayload;
    } catch {
      return {};
    }
  }

  attachmentsOf(order: PedidoResumen): PedidoAttachment[] {
    return this.payloadOf(order).attachments ?? [];
  }

  totalsOf(order: PedidoResumen) {
    const payload = this.payloadOf(order);
    return {
      area: payload?.filesTotalAreaCm2 ?? null,
      length: payload?.filesTotalLengthCm ?? null,
      price: payload?.filesTotalPrice ?? null
    };
  }

  async onFilesSelected(orderId: number, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }
    this.uploadingId.set(orderId);
    try {
      const fileArray = Array.from(files);
      await firstValueFrom(this.pedidos.uploadAttachments(orderId, fileArray));
      await this.refresh();
    } catch (error) {
      console.error('No se pudo subir los archivos', error);
      this.error.set('No pudimos subir los archivos. Intenta mas tarde.');
    } finally {
      this.uploadingId.set(null);
      input.value = '';
    }
  }

  async downloadAttachment(orderId: number, attachment: PedidoAttachment): Promise<void> {
    try {
      const blob = await firstValueFrom(this.pedidos.downloadAttachment(orderId, attachment.id));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo descargar el archivo', error);
    }
  }

  formatCurrency(value?: number | null): string {
    if (value == null) return '-';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
  }

  trackById(_: number, order: PedidoResumen): number {
    return order.id;
  }
}
