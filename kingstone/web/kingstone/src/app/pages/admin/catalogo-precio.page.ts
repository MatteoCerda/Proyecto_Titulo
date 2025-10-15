import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-admin-catalogo-precio',
  imports: [CommonModule, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  template: `
  <ion-content class="ion-padding">
    <ion-card>
      <ion-card-header><ion-card-title>Administrar catálogo y precios</ion-card-title></ion-card-header>
      <ion-card-content>
        Aquí podrás mantener productos, categorías y precios.
      </ion-card-content>
    </ion-card>
  </ion-content>
  `
})
export class AdminCatalogoPrecioPage {}

