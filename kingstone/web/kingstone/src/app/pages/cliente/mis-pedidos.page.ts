import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PedidosService, PedidoResumen, PedidoAttachment } from '../../services/pedidos.service';

interface PedidoPayload {
  products?: Array<{ name?: string; quantity?: number; price?: number }>;
  quote?: {
    materialLabel?: string;
    materialId?: string;
    materialWidthCm?: number;
    usedHeight?: number;
    items?: Array<{ name?: string; quantity?: number; widthCm?: number; heightCm?: number }>;
    totalPrice?: number;
  } | null;
  attachments?: PedidoAttachment[];
  filesTotalAreaCm2?: number;
  filesTotalLengthCm?: number;
  filesTotalPrice?: number;
  note?: string;
}

@Component({
  standalone: true,
  selector: 'app-mis-pedidos',
  imports: [CommonModule, IonContent, IonButton, DatePipe, RouterLink],
  templateUrl: './mis-pedidos.page.html',
  styleUrls: ['./mis-pedidos.page.scss']
})
export class MisPedidosPage implements OnInit {
  private readonly pedidos = inject(PedidosService);

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly expandedId = signal<number | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.pedidos.listMine());
      this.orders.set(data);
      this.error.set(null);
    } catch (err: any) {
      console.error('Error obteniendo pedidos del cliente', err);
      const status = err?.status;
      const serverMessage = err?.error?.message;
      if (status === 401) {
        this.error.set('Debes iniciar sesión para ver tus pedidos.');
      } else if (status === 403) {
        this.error.set('Tu cuenta no tiene permisos para ver esta información.');
      } else {
        this.error.set(serverMessage || 'No pudimos cargar tus pedidos. Intenta más tarde.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  toggle(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
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
      price: payload?.filesTotalPrice ?? null
    };
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
}
