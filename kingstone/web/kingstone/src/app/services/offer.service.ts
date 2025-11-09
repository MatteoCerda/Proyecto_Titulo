import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Offer {
  id: number;
  titulo: string;
  descripcion?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  activo: boolean;
  prioridad: number;
  itemId?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  precioOferta?: number | null;
  basePrice?: number | null;
  offerPrice?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  inventario?: {
    id: number;
    code: string;
    name: string;
  } | null;
}

@Injectable({
  providedIn: 'root'
})
export class OfferService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private activeOffers$: Observable<Offer[]> | null = null;

  getActiveOffers(): Observable<Offer[]> {
    if (!this.activeOffers$) {
      this.activeOffers$ = this.http.get<Offer[]>(`${this.apiUrl}/api/offers`).pipe(
        shareReplay(1)
      );
    }
    return this.activeOffers$;
  }

  getOfferForProduct(productId: number): Observable<Offer | undefined> {
    return this.getActiveOffers().pipe(
      map(offers => offers.find(offer => offer.itemId === productId))
    );
  }
}
