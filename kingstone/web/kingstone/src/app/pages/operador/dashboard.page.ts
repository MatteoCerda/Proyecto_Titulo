import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-operator-dashboard',
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle],
  template: `
    <ion-header>
      <ion-toolbar color="medium">
        <ion-title>Panel del Operador</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <h2>Bienvenido Operador 🧾</h2>
      <p>Desde aquí puedes revisar y enviar pedidos a impresión.</p>
    </ion-content>
  `
})
export class OperatorDashboardPage {}

