import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  imports: [IonContent],
  template: `<ion-content class="ion-padding"><h2>403 - Sin permisos</h2></ion-content>`
})
export class ForbiddenPage {}
