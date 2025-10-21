import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

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
  styleUrls: ['./home.page.scss']
})
export class HomePage {
  private readonly http = inject(HttpClient);

  ofertas = signal<OfertaCliente[]>([]);
  cargando = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    this.cargarOfertas();
  }

  cargarOfertas() {
    this.cargando.set(true);
    this.http.get<OfertaCliente[]>(`http://localhost:3000/offers`).subscribe({
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
}
