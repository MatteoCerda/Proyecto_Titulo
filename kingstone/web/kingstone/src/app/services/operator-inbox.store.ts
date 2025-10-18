import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PedidosService, PedidoResumen } from './pedidos.service';

@Injectable({ providedIn: 'root' })
export class OperatorInboxStore {
  private readonly pedidos = inject(PedidosService);
  private readonly destroyRef = inject(DestroyRef);

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  readonly orders = signal<PedidoResumen[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pendingCount = computed(() =>
    this.orders().filter(order => order.estado === 'PENDIENTE' && (order.notificado ?? true)).length
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
  }

  start(intervalMs = 15000) {
    if (this.pollHandle) {
      return;
    }
    this.refresh();
    this.pollHandle = setInterval(() => this.refresh(false), intervalMs);
  }

  stop() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async refresh(showLoader = true) {
    if (showLoader) {
      this.loading.set(true);
    }
    try {
      const data = await firstValueFrom(this.pedidos.listPending());
      this.orders.set(data);
      this.error.set(null);
    } catch (err) {
      console.error('Error al cargar pedidos pendientes', err);
      if (showLoader) {
        this.error.set('No pudimos cargar las solicitudes pendientes.');
      }
    } finally {
      if (showLoader) {
        this.loading.set(false);
      }
    }
  }

  async markAsSeen(id: number) {
    try {
      await firstValueFrom(this.pedidos.markAsSeen(id));
      this.orders.update(list => list.filter(item => item.id !== id));
      this.refresh(false);
    } catch (err) {
      console.error('No se pudo marcar la solicitud como revisada', err);
    }
  }
}
