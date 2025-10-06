import { Component, inject, signal } from '@angular/core';
import { IonContent, IonList, IonItem, IonLabel, IonButton, IonBadge } from '@ionic/angular/standalone';
import { PedidosService } from '../../services/pedidos.service';
import { AuthService } from '../../core/auth.service';

@Component({
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonLabel, IonButton, IonBadge],
  template: `
  <ion-content class="ion-padding">
    <h2>Pedidos</h2>
    <ion-list>
      <ion-item *ngFor="let p of pedidos()">
        <ion-label>
          <h3>#{{p.id}} — {{p.status}}</h3>
          <p>{{p.designFileUrl}}</p>
        </ion-label>

        <ion-button *ngIf="auth.hasRole(['ADMIN','OPERATOR']) && p.status==='PENDING_REVIEW'" (click)="aprobar(p.id, true)">Aprobar</ion-button>
        <ion-button *ngIf="auth.hasRole(['ADMIN','OPERATOR']) && ['APPROVED','PENDING_REVIEW'].includes(p.status)" (click)="imprimir(p.id)">Enviar a impresión</ion-button>
      </ion-item>
    </ion-list>
  </ion-content>
  `
})
export class PedidosPage {
  private service = inject(PedidosService);
  auth = inject(AuthService);

  pedidos = signal<any[]>([
    { id: 101, status: 'PENDING_REVIEW', designFileUrl: 'assets/img/muestra-arte1.png' },
    { id: 102, status: 'APPROVED',       designFileUrl: 'assets/img/muestra-arte2.png' },
  ]);

  async aprobar(id: number, approve: boolean) {
    await this.service.approve(id, approve).toPromise();
    this.pedidos.set(this.pedidos().map(p => p.id===id ? { ...p, status: approve?'APPROVED':'REJECTED'} : p));
  }

  async imprimir(id: number) {
    const payload = { material: 'DTF', widthMm: 570, heightMm: 1000, copies: 1, printerName: 'DTF-EPSON' };
    await this.service.sendToPrint(id, payload).toPromise();
    this.pedidos.set(this.pedidos().map(p => p.id===id ? { ...p, status: 'QUEUED_FOR_PRINT'} : p));
  }
}
