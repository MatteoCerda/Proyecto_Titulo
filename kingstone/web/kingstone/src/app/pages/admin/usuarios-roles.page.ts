import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-admin-usuarios-roles',
  imports: [CommonModule, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  template: `
  <ion-content class="ion-padding">
    <ion-card>
      <ion-card-header><ion-card-title>Gestionar usuario/rol</ion-card-title></ion-card-header>
      <ion-card-content>
        Aquí irá el CRUD de usuarios y asignación de roles.
      </ion-card-content>
    </ion-card>
  </ion-content>
  `
})
export class AdminUsuariosRolesPage {}

