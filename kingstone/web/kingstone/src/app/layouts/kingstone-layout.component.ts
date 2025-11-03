import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonFooter,
  IonIcon,
  IonSearchbar,
  IonRouterOutlet,
} from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';
import { CartService } from '../services/cart.service';
import { addIcons } from 'ionicons';
import { cartOutline, searchOutline, personOutline } from 'ionicons/icons';

addIcons({ cartOutline, searchOutline, personOutline });

@Component({
  selector: 'app-kingstone-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    IonHeader,
    IonToolbar,
    IonRouterOutlet,
    IonFooter,
    IonIcon,
    IonSearchbar,
  ],
  template: `
  <!-- === HEADER === -->
  <ion-header #appHeader class="ks-header" style="--background:#0c4a6e; --ion-background-color:#0c4a6e; color:#ffffff;">
    <!-- Barra principal -->
    <ion-toolbar class="ks-toolbar" style="--background:#0c4a6e; --ion-toolbar-background:#0c4a6e; color:#ffffff;">
      <div class="ks-bar">
        <!-- Izquierda: logo -->
        <a class="ks-logo-wrap" routerLink="/">
          <img src="assets/kingston-estampados.png" alt="Kingstone logo" class="ks-logo" />
        </a>

        <!-- Centro: menÃº -->
        <nav class="ks-nav" style="color:#ffffff;">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Inicio</a>
          <a routerLink="/productos" routerLinkActive="active">Productos</a>
          <a routerLink="/crea-tu-diseno" routerLinkActive="active">Crea tu dise&ntilde;o</a>
          <a href="https://wa.me/56986412218" target="_blank" rel="noopener">Cont&aacute;ctanos</a>
        </nav>

        <!-- Derecha: iconos -->
        <div class="ks-actions" style="color:#ffffff;">
          <span class="welcome" *ngIf="auth.isAuthenticated()">Bienvenido/a, {{ auth.user()?.fullName || auth.getEmail() }}</span>
          <button type="button" class="icon-btn" aria-label="Buscar" (click)="toggleSearch()">
            <ion-icon name="search-outline"></ion-icon>
          </button>

          <button type="button" class="icon-btn cart-btn" aria-label="Carrito" routerLink="/carrito">
            <ion-icon name="cart-outline"></ion-icon>
            <span class="cart-badge" *ngIf="cartCount() > 0">{{ cartCount() }}</span>
          </button>


          <button type="button" class="icon-btn" aria-label="Cuenta" (click)="onProfileClick()">
            <ion-icon name="person-outline"></ion-icon>
          </button>
          <div class="ks-user-menu" *ngIf="showUserMenu">
            <a routerLink="/perfil">Mi perfil</a>
            <a routerLink="/cliente/mis-pedidos">Mis pedidos</a>
            <a routerLink="/cliente/metodos-pago">Metodos de pago</a>
            <button type="button" (click)="logout()">Cerrar sesion</button>
          </div>
        </div>
      </div>
    </ion-toolbar>

    <!-- Barra de bÃºsqueda desplegable -->
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

  <!-- === CONTENIDO (sin ion-content para evitar doble scroll) === -->
  <ion-router-outlet></ion-router-outlet>

  <!-- === FOOTER === -->
<ion-footer #appFooter class="ks-footer ks-slim" style="--background:#0c4a6e; --ion-background-color:#0c4a6e; background:#0c4a6e; color:#ffffff;">
  <div class="ks-footer-wrap" style="color:#ffffff;">
    <!-- Columna izquierda: logo + datos -->
    <div class="ks-footer-left">
      <img class="ks-footer-logo" src="assets/kingston-estampados.png" alt="Kingstone logo" />

      <div class="ks-footer-item">
        <ion-icon name="location-outline"></ion-icon>
        <div>
          <strong>Ubicaci&oacute;n:</strong>
          <div>Loreto 216, Recoleta</div>
          <div>Toesca 2760, Santiago Centro</div>
        </div>
      </div>

      <div class="ks-footer-item">
        <ion-icon name="information-circle-outline"></ion-icon>
        <div>
          <strong>Horarios de atenci&oacute;n:</strong>
          <div>Lunes a viernes 10:00 AM a 7:00 PM</div>
          <div>S&aacute;bado 10:30 AM a 3:00 PM</div>
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

    <!-- Columna centro: EnvÃ­os/retiros -->
    <div class="ks-footer-middle">
      <p><strong>Retiros en nuestro taller</strong></p>
      <p><strong>Delivery en RM</strong></p>
      <p><strong>Env&iacute;os a regiones</strong></p>
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
  cart = inject(CartService);
  showSearch = false;
  showUserMenu = false;
  cartCount = this.cart.totalItems;
  private footerHidden = false;
  private lastTouchY: number | null = null;
  // Template refs to measure header/footer and set content offsets
  // Note: ViewChild is typed at runtime via Angular; keep as any to avoid SSR issues
  // Using non-strict here deliberately
  headerRef: any;
  footerRef: any;

  ngOnInit() {
    window.addEventListener('wheel', this.onWheel as any, { passive: true } as any);
    window.addEventListener('touchstart', this.onTouchStart as any, { passive: true } as any);
    window.addEventListener('touchmove', this.onTouchMove as any, { passive: true } as any);
    const applyOffsets = () => {
      const h = document.querySelector('ion-header.ks-header') as HTMLElement | null;
      const f = document.querySelector('ion-footer.ks-footer') as HTMLElement | null;
      const hh = h?.getBoundingClientRect().height || 56;
      const fh = f?.getBoundingClientRect().height || 120;
      document.documentElement.style.setProperty('--ks-header-h', `${Math.round(hh)}px`);
      document.documentElement.style.setProperty('--ks-footer-h', `${Math.round(fh)}px`);
    };
    setTimeout(applyOffsets, 0);
    window.addEventListener('resize', applyOffsets as any, { passive: true } as any);
  }

  ngOnDestroy() {
    window.removeEventListener('wheel', this.onWheel as any);
    window.removeEventListener('touchstart', this.onTouchStart as any);
    window.removeEventListener('touchmove', this.onTouchMove as any);
    document.body.classList.remove('footer-hidden');
  }

  onWheel = (e: WheelEvent) => {
    if (e.deltaY > 0) this.hideFooter();
    else if (e.deltaY < 0) this.showFooter();
  };

  onTouchStart = (e: TouchEvent) => {
    this.lastTouchY = e.touches?.[0]?.clientY ?? null;
  };
  onTouchMove = (e: TouchEvent) => {
    if (this.lastTouchY == null) return;
    const y = e.touches?.[0]?.clientY ?? this.lastTouchY;
    const dy = y - this.lastTouchY;
    if (dy < -2) this.hideFooter();
    else if (dy > 2) this.showFooter();
    this.lastTouchY = y;
  };

  private hideFooter() {
    if (this.footerHidden) return;
    this.footerHidden = true;
    document.body.classList.add('footer-hidden');
  }
  private showFooter() {
    if (!this.footerHidden) return;
    this.footerHidden = false;
    document.body.classList.remove('footer-hidden');
  }

  toggleSearch() {
    this.showSearch = !this.showSearch;
  }

  onSearch(ev: any) {
    const q = (ev?.detail?.value ?? '').trim();
    // TODO: dispara tu bÃºsqueda global aquÃ­
    // console.log('buscar:', q);
  }

  onProfileClick() {
    if (!this.auth.isAuthenticated()) {
      (window as any).location.href = '/login';
      return;
    }
    // Si es ADMIN, lleva al panel admin para activar el header de administración
    const role = this.auth.getRole();
    if (role === 'ADMIN') {
      (window as any).location.href = '/admin/inicio';
    } else {
            const target = role === 'OPERATOR' ? '/operador/inicio' : '/cliente/mis-pedidos';
      (window as any).location.href = target;
    }
  }

  logout() {
    this.auth.logout();
    this.showUserMenu = false;
    (window as any).location.href = '/login';
  }
}


















