import { Component } from '@angular/core';
import {
  IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonRouterOutlet
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-client-shell',
  imports: [IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonRouterOutlet, RouterLink],
  template: `
  <ion-menu contentId="client">
    <ion-header><ion-toolbar><ion-title>Mi Cuenta</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-list>
        <ion-item routerLink="/cliente/mis-pedidos">Mis pedidos</ion-item>
        <ion-item routerLink="/cliente/nuevo-pedido">Nuevo pedido</ion-item>
      </ion-list>
    </ion-content>
  </ion-menu>
  <div class="ion-page" id="client">
    <ion-router-outlet></ion-router-outlet>
  </div>
  `
})
export class ClientShellComponent {}
