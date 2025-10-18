import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface CatalogItem {
  id: number;
  name: string;
  itemType: string;
  color: string;
  provider: string;
  quantity: number;
  price: number;
  priceWeb: number;
  priceStore: number;
  priceWsp: number;
  imageUrl: string | null;
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
  private readonly basePath = '/catalogo';

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
      const data = await firstValueFrom(this.http.get<CatalogItem[]>(url));
      this.itemsSignal.set(
        data.map(item => ({
          ...item,
          price: item.price ?? item.priceWeb ?? 0
        }))
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
      const item = await firstValueFrom(
        this.http.get<CatalogItem>(`${this.basePath}/${id}`)
      );
      return {
        ...item,
        price: item.price ?? item.priceWeb ?? 0
      };
    } catch (error) {
      console.error('Error obteniendo producto', error);
      return null;
    }
  }

  private areSameFilters(a: CatalogFilters, b: CatalogFilters): boolean {
    return (a.search || '') === (b.search || '') && (a.tipo || '') === (b.tipo || '');
  }
}
