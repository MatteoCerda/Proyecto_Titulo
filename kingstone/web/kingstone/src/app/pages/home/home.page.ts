import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';

import { environment } from '../../../environments/environment';
import { CatalogService } from '../../services/catalog.service';

// Register Swiper custom elements (v12)
register();

interface OfertaCliente {
  id: number;
  titulo: string;
  descripcion?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  prioridad: number;
  startAt?: string | null;
  endAt?: string | null;
  itemId?: number | null;
  inventario?: { code: string; name: string } | null;
  precioOferta?: number | null;
  basePrice?: number | null;
  offerPrice?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
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
  private readonly catalog = inject(CatalogService);
  readonly heroImages = [
    {
      src: 'assets/Pagina-inicio/pagina inicio kingston.png',
      alt: 'Pagina inicio Kingston'
    },
    {
      src: 'assets/Pagina-inicio/Artboard 1-100.jpg',
      alt: 'Hero Kingston Estampados'
    },
    {
      src: 'assets/Pagina-inicio/ofertas.jpg',
      alt: 'Ofertas'
    }
  ];
  readonly heroSlides: SwiperOptions = this.buildHeroSlidesConfig();

  readonly cardImages = [
    {
      src: 'assets/Pagina-inicio/BANNER-INICIO/banner-atencion.png',
      alt: 'Atencion'
    },
    {
      src: 'assets/Pagina-inicio/BANNER-INICIO/banner-envio.png',
      alt: 'Envio'
    },
    {
      src: 'assets/Pagina-inicio/BANNER-INICIO/banner-retiro.png',
      alt: 'Retiro'
    }
  ];

  private endpoint(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return this.apiBase ? `${this.apiBase}${normalized}` : normalized;
  }

  ofertas = signal<OfertaCliente[]>([]);
  cargando = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    this.cargarOfertas();
  }

  cargarOfertas() {
    this.cargando.set(true);
    this.http.get<OfertaCliente[]>(this.endpoint('/api/offers')).subscribe({
      next: async data => {
        const enriched = await Promise.all(data.map(oferta => this.enrichOffer(oferta)));
        this.ofertas.set(enriched);
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

  private async enrichOffer(oferta: OfertaCliente): Promise<OfertaCliente> {
    const base = oferta.basePrice ?? null;
    const rawOffer = oferta.offerPrice ?? oferta.precioOferta ?? null;

    const discountAmountDirect =
      oferta.discountAmount ??
      (base !== null && rawOffer !== null && base > rawOffer ? base - rawOffer : null);
    const discountPercentDirect =
      oferta.discountPercent ??
      (discountAmountDirect !== null && base ? Math.round((discountAmountDirect / base) * 100) : null);

    if (!oferta.itemId || base !== null) {
      return {
        ...oferta,
        basePrice: base,
        offerPrice: rawOffer,
        discountAmount: discountAmountDirect,
        discountPercent: discountPercentDirect
      };
    }

    try {
      const item = await this.catalog.getItem(oferta.itemId);
      if (!item) {
        return {
          ...oferta,
          basePrice: base,
          offerPrice: rawOffer,
          discountAmount: discountAmountDirect,
          discountPercent: discountPercentDirect
        };
      }

      const basePrice = item.basePrice ?? item.price ?? item.priceWeb ?? 0;
      const offerPrice = rawOffer ?? item.offerPrice ?? null;
      const discountAmount =
        offerPrice !== null && basePrice > offerPrice ? basePrice - offerPrice : null;
      const discountPercent =
        discountAmount !== null && basePrice
          ? Math.round((discountAmount / basePrice) * 100)
          : null;

      return {
        ...oferta,
        basePrice,
        offerPrice,
        discountAmount,
        discountPercent
      };
    } catch {
      return {
        ...oferta,
        basePrice: base,
        offerPrice: rawOffer,
        discountAmount: discountAmountDirect,
        discountPercent: discountPercentDirect
      };
    }
  }

  tieneDescuento(oferta: OfertaCliente): boolean {
    const base = oferta.basePrice ?? null;
    const current = oferta.offerPrice ?? oferta.precioOferta ?? null;
    return base !== null && current !== null && current < base;
  }

  // Footer hide/show se maneja globalmente en el layout

  private buildHeroSlidesConfig(): SwiperOptions {
    const slidesCount = this.heroImages.length;
    return {
      slidesPerView: 1,
      loop: slidesCount > 1,
      speed: 600,
      autoplay: {
        delay: 5000,
        disableOnInteraction: false
      },
      pagination: {
        clickable: true
      }
    };
  }
}





