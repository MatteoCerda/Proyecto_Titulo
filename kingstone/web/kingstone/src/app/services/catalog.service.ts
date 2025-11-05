import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Offer, OfferService } from './offer.service';

export interface CatalogApiItem {
  id: number;
  name: string;
  itemType: string;
  color: string;
  provider: string;
  quantity: number;
  price: number | null;
  priceWeb: number | null;
  priceStore: number | null;
  priceWsp: number | null;
  imageUrl: string | null;
}

export interface CatalogItem extends CatalogApiItem {
  price: number;
  basePrice: number;
  offerPrice: number | null;
  discountAmount: number | null;
  discountPercent: number | null;
  offerTitle: string | null;
  offerId: number | null;
}

export interface CatalogFilters {
  search?: string;
  tipo?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly basePath = '/api/catalogo';
  private readonly offerService = inject(OfferService);

  private readonly itemsSignal = signal<CatalogItem[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private lastFilters: CatalogFilters = {};

  readonly items = computed(() => this.itemsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  async loadCatalog(filters: CatalogFilters = {}, force = false): Promise<void> {
    const sameFilters = !force && this.areSameFilters(filters, this.lastFilters);
    if (this.itemsSignal().length && sameFilters) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('q', filters.search);
      if (filters.tipo) params.set('tipo', filters.tipo);
      const query = params.toString();
      const url = this.basePath + (query ? '?' + query : '');

      const [apiItems, offers] = await Promise.all([
        firstValueFrom(this.http.get<CatalogApiItem[]>(url)),
        firstValueFrom(this.offerService.getActiveOffers()).catch(() => [])
      ]);

      const offersByItemId = new Map<number, Offer>();
      for (const offer of offers) {
        if (offer.itemId !== null && offer.itemId !== undefined) {
          offersByItemId.set(offer.itemId, offer);
        }
      }

      this.itemsSignal.set(
        apiItems.map(apiItem => this.mapItemWithOffer(apiItem, offersByItemId.get(apiItem.id)))
      );
      this.lastFilters = { ...filters };
    } catch (error) {
      console.error('Error cargando catalogo', error);
      this.errorSignal.set('No se pudo cargar el catalogo.');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async getItem(id: number): Promise<CatalogItem | null> {
    try {
      const [item, offers] = await Promise.all([
        firstValueFrom(this.http.get<CatalogApiItem>(`${this.basePath}/${id}`)),
        firstValueFrom(this.offerService.getActiveOffers()).catch(() => [])
      ]);
      const offer = offers.find(o => o.itemId === id);
      return this.mapItemWithOffer(item, offer);
    } catch (error) {
      console.error('Error obteniendo producto', error);
      return null;
    }
  }

  private areSameFilters(a: CatalogFilters, b: CatalogFilters): boolean {
    return (a.search || '') === (b.search || '') && (a.tipo || '') === (b.tipo || '');
  }

  private mapItemWithOffer(item: CatalogApiItem, offer?: Offer): CatalogItem {
    const basePrice = this.resolveBasePrice(item);
    let offerPrice: number | null = null;
    if (offer) {
      const candidate =
        offer.offerPrice ?? offer.precioOferta ?? null;
      if (typeof candidate === 'number' && !Number.isNaN(candidate) && candidate >= 0) {
        offerPrice = candidate;
      }
    }
    const appliedPrice = offerPrice ?? basePrice;
    const rawDiff = offerPrice !== null ? basePrice - offerPrice : 0;
    const discountAmount =
      offerPrice !== null && rawDiff > 0 ? Math.round(rawDiff) : null;
    const discountPercent =
      discountAmount !== null && basePrice > 0
        ? Math.round((discountAmount / basePrice) * 100)
        : null;

    return {
      ...item,
      price: appliedPrice,
      basePrice,
      offerPrice,
      discountAmount,
      discountPercent,
      offerTitle: offer?.titulo ?? null,
      offerId: offer?.id ?? null
    };
  }

  private resolveBasePrice(item: CatalogApiItem): number {
    const candidates = [item.price, item.priceWeb, item.priceStore, item.priceWsp];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && !Number.isNaN(candidate) && candidate > 0) {
        return candidate;
      }
    }
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && !Number.isNaN(candidate)) {
        return candidate;
      }
    }
    return 0;
  }
}
