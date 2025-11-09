import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { register } from 'swiper/element/bundle';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
// Register Swiper custom elements (v12)
register();

import { environment } from '../../../environments/environment';

// Swiper elements registered above

interface OfertaCliente {
  id: number;
  titulo: string;
  descripcion?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  prioridad: number;
  startAt?: string | null;
  endAt?: string | null;
  inventario?: { code: string; name: string } | null;
}

@Component({
  standalone: true,
  selector: 'app-home',
  imports: [CommonModule, IonContent, IonButton, RouterLink],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class HomePage {
  private readonly http = inject(HttpClient);
  private readonly apiBase = (environment.apiUrl || '').replace(/\/$/, '');

  private endpoint(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return this.apiBase ? `${this.apiBase}${normalized}` : normalized;
  }

  ofertas = signal<OfertaCliente[]>([]);
  cargando = signal(false);
  error = signal<string | null>(null);

  heroImages = [
    { src: 'assets/kingston-hero-placeholder.png', alt: 'Imagen destacada 1' },
    { src: 'assets/kingston-hero-placeholder.png', alt: 'Imagen destacada 2' },
    { src: 'assets/kingston-hero-placeholder.png', alt: 'Imagen destacada 3' }
  ];

  ngOnInit() {
    this.cargarOfertas();
  }


  cargarOfertas() {
    this.cargando.set(true);
    this.http.get<OfertaCliente[]>(this.endpoint('/api/offers')).subscribe({
      next: data => {
        this.ofertas.set(data);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: err => {
        this.error.set(err?.error?.message || 'No se pudieron cargar las ofertas');
        this.ofertas.set([]);
        this.cargando.set(false);
      }
    });
  }

  // Footer hide/show se maneja globalmente en el layout
}


