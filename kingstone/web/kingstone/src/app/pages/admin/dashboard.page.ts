import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle],
  template: `
    <ion-header>
      <ion-toolbar color="warning">
        <ion-title>Panel de Administración</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <h2>Bienvenido Administrador 👑</h2>
      <p>Aquí podrás gestionar usuarios, pedidos y operadores.</p>
    </ion-content>
  `
})
export class DashboardPage {}
