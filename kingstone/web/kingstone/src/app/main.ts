import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-kingstone-layout',
  imports: [CommonModule, RouterOutlet, RouterLink],
  template: `
    <div class="layout">
      <!-- Header -->
      <header class="header">
        <div class="header__left">
          <img src="assets/kingstone-icon.png" alt="logo" />
          <div class="header__search"></div>
        </div>

        <div class="header__right">
          <button routerLink="/login" class="btn-login">Inicia sesión</button>
        </div>
      </header>

      <!-- Contenido principal -->
      <main class="content">
        <router-outlet></router-outlet>
      </main>

      <!-- Footer -->
      <footer class="footer">
        <div class="footer__left">
          <p><b>Horario de atención:</b><br>
          Lunes a viernes 10:00 a 19:00<br>
          Sábado 10:30 a 15:00</p>
        </div>

        <div class="footer__center">
          <p><b>Canal de ayuda:</b><br>
          <a href="tel:+56986412218">+56 9 8641 2218</a></p>
        </div>

        <div class="footer__right">
          <p><b>Locales:</b><br>
          Loreto 216, Recoleta<br>
          Toesca 2760, Santiago Centro</p>
        </div>
      </footer>
    </div>
  `,
  styleUrls: ['./kingstone-layout.component.scss']
})
export class KingstoneLayoutComponent {}
