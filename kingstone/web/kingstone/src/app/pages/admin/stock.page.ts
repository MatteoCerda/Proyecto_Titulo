import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-admin-stock',
  imports: [CommonModule, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  template: `
  <ion-content class="ion-padding">
    <ion-card>
      <ion-card-header><ion-card-title>Administrar stock</ion-card-title></ion-card-header>
      <ion-card-content>
        Aquí podrás actualizar inventario y movimientos de stock.
      </ion-card-content>
    </ion-card>
  </ion-content>
  `
})
export class AdminStockPage {}

