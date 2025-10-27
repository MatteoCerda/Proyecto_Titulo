import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { PedidosService, ClientePedidosResumen } from '../../services/pedidos.service';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-operator-clientes',
  imports: [CommonModule, IonContent, IonButton, DatePipe],
  templateUrl: './clientes.page.html',
  styleUrls: ['./clientes.page.scss']
})
export class OperatorClientesPage implements OnInit {
  private readonly pedidos = inject(PedidosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly clientes = signal<ClientePedidosResumen[]>([]);
  readonly selectedKey = signal<string | null>(null);
  readonly trackByEmail = (_: number, cliente: ClientePedidosResumen): string =>
    this.buildClienteKey(cliente);

  private buildClienteKey(cliente: ClientePedidosResumen): string {
    const email = this.normalizeEmail(cliente.email);
    if (email) {
      return email;
    }
    const firstPedidoId = cliente.pedidos?.[0]?.id;
    if (firstPedidoId) {
      return `pedido-${firstPedidoId}`;
    }
    return `cliente-${(cliente.nombre || 'cliente-sin-nombre').trim().toLowerCase()}`;
  }
  readonly selectedCliente = computed(() => {
    const key = this.selectedKey();
    if (!key) {
      return null;
    }
    return (
      this.clientes().find(cliente => this.buildClienteKey(cliente) === key) ?? null
    );
  });
  readonly selectedIndex = computed(() => {
    const key = this.selectedKey();
    if (!key) {
      return null;
    }
    const idx = this.clientes().findIndex(cliente => this.buildClienteKey(cliente) === key);
    return idx >= 0 ? idx : null;
  });

  ngOnInit(): void {
    const initialSelected = this.normalizeEmail(this.route.snapshot.queryParamMap.get('selected'));
    if (initialSelected) {
      this.selectedKey.set(initialSelected);
    }
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.pedidos.listClientesResumen());
      const ordered = data.map(cliente => ({
        ...cliente,
        pedidos: [...(cliente.pedidos ?? [])].sort((a, b) => {
          const left = new Date(a.createdAt).getTime();
          const right = new Date(b.createdAt).getTime();
          return right - left;
        })
      }));
      this.clientes.set(ordered);
      this.ensureSelection();
      this.error.set(null);
    } catch (err) {
      console.error('Error obteniendo resumen de clientes', err);
      this.error.set('No pudimos cargar la lista de clientes.');
    } finally {
      this.loading.set(false);
    }
  }

  selectCliente(cliente: ClientePedidosResumen): void {
    const key = this.buildClienteKey(cliente);
    if (this.selectedKey() === key) {
      return;
    }
    this.selectedKey.set(key);
    this.updateQueryParam(key);
  }

  trackByPedido(_: number, pedido: ClientePedidosResumen['pedidos'][number]): number {
    return pedido.id;
  }

  isSelected(cliente: ClientePedidosResumen): boolean {
    return this.buildClienteKey(cliente) === this.selectedKey();
  }

  labelEstado(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      EN_REVISION: 'En revision',
      POR_PAGAR: 'Por pagar',
      EN_PRODUCCION: 'En produccion',
      COMPLETADO: 'Completado',
      CANCELADO: 'Cancelado'
    };
    return labels[estado] || estado;
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
      case 'CANCELADO':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '-';
    }
    return this.currencyFormatter.format(value);
  }

  pedidosTotales(cliente: ClientePedidosResumen | null): number {
    if (!cliente?.pedidos) {
      return 0;
    }
    return cliente.pedidos.length;
  }

  pedidosPendientes(cliente: ClientePedidosResumen | null): number {
    if (!cliente?.pedidos) {
      return 0;
    }
    return cliente.pedidos.filter(p => p.estado === 'PENDIENTE' || p.estado === 'EN_REVISION').length;
  }

  private ensureSelection(): void {
    const list = this.clientes();
    if (!list.length) {
      this.selectedKey.set(null);
      this.updateQueryParam(null);
      return;
    }
    const current = this.selectedKey();
    if (current) {
      const exists = list.some(cliente => this.buildClienteKey(cliente) === current);
      if (exists) {
        return;
      }
    }
    const firstKey = this.buildClienteKey(list[0]);
    this.selectedKey.set(firstKey);
    this.updateQueryParam(firstKey);
  }

  private updateQueryParam(email: string | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: email ? { selected: email } : { selected: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    return email ? email.trim().toLowerCase() : null;
  }
}
