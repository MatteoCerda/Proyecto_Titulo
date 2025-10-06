import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonFooter } from '@ionic/angular/standalone';

@Component({
  selector: 'app-kingstone-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonFooter,
    IonButtons,
    IonButton,
    IonIcon
  ],
  template: `
  <!-- === HEADER === -->
  <ion-header class="ks-header">
    <ion-toolbar class="ks-toolbar">
      <div class="ks-header-left">
        <img src="assets/icon/kingstone-estampados.png" alt="Kingstone logo" class="ks-logo" />
        <div class="ks-search">
          <input type="text" placeholder="Busca en toda la tienda..." />
          <ion-icon name="search-outline"></ion-icon>
        </div>
      </div>

      <div class="ks-header-right">
        <a routerLink="/login" class="ks-action">
          <ion-icon name="person-outline"></ion-icon> Iniciar sesión
        </a>
        <a routerLink="/tracking" class="ks-action">
          <ion-icon name="bus-outline"></ion-icon> Tracking
        </a>
        <a routerLink="/carrito" class="ks-action">
          <ion-icon name="cart-outline"></ion-icon> Tu carro (0)
        </a>
      </div>
    </ion-toolbar>
  </ion-header>

  <!-- === CONTENIDO === -->
  <ion-content class="ks-main-content" fullscreen>
    <router-outlet></router-outlet>
  </ion-content>

  <!-- === FOOTER === -->
  <ion-footer class="ks-footer">
    <div class="ks-footer-content">
      <div class="ks-footer-section">
        <p><strong>Horario de atención:</strong></p>
        <p>Lunes a viernes 10:00 a 19:00</p>
        <p>Sábado 10:30 a 15:00</p>
      </div>
      <div class="ks-footer-section">
        <p><strong>Canal de ayuda:</strong></p>
        <p>+56 9 8641 2218</p>
      </div>
      <div class="ks-footer-section">
        <p>Loreto 216, Recoleta</p>
        <p>Toesca 2760, Santiago Centro</p>
      </div>
    </div>
  </ion-footer>
  `,
  styleUrls: ['./kingstone-layout.component.scss']
})
export class KingstoneLayoutComponent {}

