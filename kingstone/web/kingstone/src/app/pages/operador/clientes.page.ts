import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
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

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly clientes = signal<ClientePedidosResumen[]>([]);

  ngOnInit(): void {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.pedidos.listClientesResumen());
      this.clientes.set(data);
      this.error.set(null);
    } catch (err) {
      console.error('Error obteniendo resumen de clientes', err);
      this.error.set('No pudimos cargar la lista de clientes.');
    } finally {
      this.loading.set(false);
    }
  }

  trackByEmail(_: number, cliente: ClientePedidosResumen): string {
    return cliente.email ?? `sin-email-${cliente.pedidos?.[0]?.id ?? 0}`;
  }
}
