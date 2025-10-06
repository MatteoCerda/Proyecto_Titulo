import { Component } from '@angular/core';
import {
  IonSplitPane, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonRouterOutlet
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-admin-shell',
  imports: [IonSplitPane, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonRouterOutlet, RouterLink],
  template: `
  <ion-split-pane contentId="main">
    <ion-menu contentId="main">
      <ion-header><ion-toolbar><ion-title>Operación</ion-title></ion-toolbar></ion-header>
      <ion-content>
        <ion-list>
          <ion-item routerLink="/admin/pedidos">Pedidos</ion-item>
        </ion-list>
      </ion-content>
    </ion-menu>
    <div class="ion-page" id="main">
      <ion-router-outlet></ion-router-outlet>
    </div>
  </ion-split-pane>
  `
})
export class AdminShellComponent {}
