import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonFooter,
  IonIcon,
  IonBadge,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-kingstone-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IonHeader,
    IonToolbar,
    IonContent,
    IonFooter,
    IonIcon,
    IonBadge,
    IonSearchbar,
  ],
  template: `
  <!-- === HEADER === -->
  <ion-header class="ks-header" style="--background:#0c4a6e; --ion-background-color:#0c4a6e; color:#ffffff;">
    <!-- Barra principal -->
    <ion-toolbar class="ks-toolbar" style="--background:#0c4a6e; --ion-toolbar-background:#0c4a6e; color:#ffffff;">
      <div class="ks-bar">
        <!-- Izquierda: logo -->
        <a class="ks-logo-wrap" routerLink="/">
          <img src="assets/kingston-estampados.png" alt="Kingstone logo" class="ks-logo" />
        </a>

        <!-- Centro: menú -->
        <nav class="ks-nav" style="color:#ffffff;">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Inicio</a>
          <a routerLink="/productos" routerLinkActive="active">Productos</a>
          <a routerLink="/crea-tu-diseno" routerLinkActive="active">Crea tu dise&ntilde;o</a>
          <a routerLink="/contacto" routerLinkActive="active">Cont&aacute;ctanos</a>
        </nav>

        <!-- Derecha: iconos -->
        <div class="ks-actions" style="color:#ffffff;">
          <button type="button" class="icon-btn" aria-label="Buscar" (click)="toggleSearch()">
            <ion-icon src="/svg/search-outline.svg"></ion-icon>
          </button>


          <a [routerLink]="auth.isAuthenticated() ? '/perfil' : '/login'" class="icon-btn" aria-label="Cuenta">
            <ion-icon src="/svg/person-outline.svg"></ion-icon>
          </a>
        </div>
      </div>
    </ion-toolbar>

    <!-- Barra de búsqueda desplegable -->
    <ion-toolbar *ngIf="showSearch" class="ks-toolbar-search">
      <ion-searchbar
        placeholder="Busca en toda la tienda..."
        showCancelButton="always"
        (ionCancel)="showSearch = false"
        (ionClear)="showSearch = false"
        (keyup.escape)="showSearch = false"
        (ionChange)="onSearch($event)"
      >
      </ion-searchbar>
    </ion-toolbar>
  </ion-header>

  <!-- === CONTENIDO === -->
  <ion-content class="ks-main-content">
    <router-outlet></router-outlet>
  </ion-content>

  <!-- === FOOTER === -->
<ion-footer class="ks-footer" style="--background:#0c4a6e; --ion-background-color:#0c4a6e; background:#0c4a6e; color:#ffffff;">
  <div class="ks-footer-wrap" style="color:#ffffff;">
    <!-- Columna izquierda: logo + datos -->
    <div class="ks-footer-left">
      <img class="ks-footer-logo" src="assets/kingston-estampados.png" alt="Kingstone logo" />

      <div class="ks-footer-item">
        <ion-icon name="location-outline"></ion-icon>
        <div>
          <strong>Ubicación:</strong>
          <div>Loreto 216, Recoleta</div>
          <div>Toesca 2760, Santiago Centro</div>
        </div>
      </div>

      <div class="ks-footer-item">
        <ion-icon name="information-circle-outline"></ion-icon>
        <div>
          <strong>Horarios de atención:</strong>
          <div>Lunes a viernes 10:00 AM a 7:00 PM</div>
          <div>Sábado 10:30 AM a 3:00 PM</div>
        </div>
      </div>

      <div class="ks-footer-item">
        <ion-icon name="mail-outline"></ion-icon>
        <div>
          <strong>Correo:</strong>
          <a href="mailto:kingstone.estampados@gmail.com">kingstone.estampados@gmail.com</a>
        </div>
      </div>
    </div>

    <!-- Columna centro: Envíos/retiros -->
    <div class="ks-footer-middle">
      <p><strong>Retiros en nuestro taller</strong></p>
      <p><strong>Delivery en RM</strong></p>
      <p><strong>Envíos a regiones</strong></p>
      <ul>
        <li>Starken</li>
      </ul>
    </div>

    <!-- Columna derecha: redes -->
    <div class="ks-footer-right">
      <div class="ks-socials">
        <a aria-label="WhatsApp" target="_blank" rel="noopener" href="https://wa.me/56986412218">
          <ion-icon name="logo-whatsapp"></ion-icon>
        </a>
        <a aria-label="Facebook" target="_blank" rel="noopener" href="https://facebook.com/tu_pagina">
          <ion-icon name="logo-facebook"></ion-icon>
        </a>
        <a aria-label="Instagram" target="_blank" rel="noopener" href="https://instagram.com/tu_pagina">
          <ion-icon name="logo-instagram"></ion-icon>
        </a>
      </div>
    </div>
  </div>
</ion-footer>
  `,
  styleUrls: ['./kingstone-layout.component.scss']
})
export class KingstoneLayoutComponent {
  auth = inject(AuthService);
  showSearch = false;
  cartCount = 0; // TODO: conecta tu servicio de carrito

  toggleSearch() {
    this.showSearch = !this.showSearch;
  }

  onSearch(ev: any) {
    const q = (ev?.detail?.value ?? '').trim();
    // TODO: dispara tu búsqueda global aquí
    // console.log('buscar:', q);
  }
}














