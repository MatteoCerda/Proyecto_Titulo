import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { PaymentsService } from '../../services/payments.service';
import { PedidosService } from '../../services/pedidos.service';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-webpay-return',
  imports: [CommonModule, IonContent, IonButton],
  templateUrl: './webpay-return.page.html',
  styleUrls: ['./webpay-return.page.scss'],
})
export class WebpayReturnPage implements OnInit {
  private payments = inject(PaymentsService);
  private pedidos = inject(PedidosService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  status = signal<'loading' | 'success' | 'error'>('loading');
  message = signal('Confirmando tu pago, por favor espera...');
  details = signal<any | null>(null);
  pedidoId = signal<number | null>(null);

  async ngOnInit() {
    const params = await firstValueFrom(this.route.queryParamMap);
    const token_ws = params.get('token_ws');
    const token = params.get('token');
    const tbk = params.get('TBK_TOKEN');

    if (!token_ws && !token && !tbk) {
      this.status.set('error');
      this.message.set('No recibimos el token de la transaccion.');
      return;
    }

    try {
      const payload: { token_ws?: string; token?: string; TBK_TOKEN?: string } = {};
      if (token_ws) payload.token_ws = token_ws;
      if (token) payload.token = token;
      if (tbk) payload.TBK_TOKEN = tbk;

      const result = await firstValueFrom(
        this.payments.commitTransaction(payload)
      );
      this.details.set(result.response || null);
      this.pedidoId.set(result.pedidoId ?? null);
      if (result.authorized) {
        this.status.set('success');
        this.message.set('Pago confirmado. Gracias por tu compra.');
      } else {
        this.status.set('error');
        this.message.set('No pudimos autorizar el pago. Puedes intentarlo nuevamente.');
      }
    } catch (error: any) {
      const msg = error?.error?.message || error?.message || 'Ocurrio un error al confirmar el pago.';
      this.status.set('error');
      this.message.set(msg);
    }
  }

  goToOrders() {
    this.router.navigate(['/perfil'], { queryParams: { tab: 'pedidos' } });
  }

  async downloadReceipt() {
    const id = this.pedidoId();
    if (!id) {
      return;
    }
    try {
      const blob = await firstValueFrom(this.pedidos.downloadReceipt(id));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `boleta-${id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo descargar la boleta', error);
    }
  }
}
