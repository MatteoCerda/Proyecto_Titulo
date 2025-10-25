import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PedidoResumen {
  id: number;
  cliente: string;
  email: string;
  estado: string;
  createdAt: string;
  total?: number;
  items?: number;
  notificado?: boolean;
  materialLabel?: string;
  note?: string;
  payload?: any;
}

export interface CreatePedidoRequest {
  materialId: string;
  materialLabel: string;
  materialWidthCm: number;
  usedHeight: number;
  totalPrice: number;
  note?: string | null;
  items: Array<{
    displayName: string;
    quantity: number;
    widthCm: number;
    heightCm: number;
    sizeMode?: string;
    previewUrl?: string | null;
    coverageRatio?: number;
    outlinePath?: string | null;
    pixelArea?: number;
    trimmedWidthPx?: number;
    trimmedHeightPx?: number;
  }>;
  placements?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    designWidth?: number;
    designHeight?: number;
    margin?: number;
    itemId?: number;
    copyIndex?: number;
    previewUrl?: string | null;
    clipPath?: string | null;
    rotation?: number;
  }>;
}

export interface CartPedidoProduct {
  id: number;
  name: string;
  price: number;
  quantity: number;
  itemType?: string;
  color?: string;
  provider?: string;
  imageUrl?: string | null;
}

export interface CartPedidoQuoteItem {
  name: string;
  quantity: number;
  widthCm: number;
  heightCm: number;
}

export interface CartPedidoQuote {
  materialId: string;
  materialLabel: string;
  totalPrice: number;
  usedHeight: number;
  note?: string;
  items: CartPedidoQuoteItem[];
  createdAt?: string;
}

export interface CartPedidoRequest {
  source: 'cart';
  products: CartPedidoProduct[];
  quote?: CartPedidoQuote | null;
  note?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);

  createPedido(payload: CreatePedidoRequest): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`/api/pedidos`, payload);
  }

  submitPedidoFromCart(payload: CartPedidoRequest): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`/api/pedidos`, payload);
  }

  listPending(): Observable<PedidoResumen[]> {
    return this.listByStatus('PENDIENTE');
  }

  listByStatus(status: string): Observable<PedidoResumen[]> {
    return this.http.get<PedidoResumen[]>(`/api/pedidos`, { params: { status } });
  }

  listMine(status?: string): Observable<PedidoResumen[]> {
    const params: Record<string, string> = { mine: '1' };
    if (status) {
      params['status'] = status;
    }
    return this.http.get<PedidoResumen[]>(`/api/pedidos`, { params });
  }

  markAsSeen(id: number, estado?: string): Observable<{ id: number; estado: string; notificado: boolean }> {
    const body = estado ? { estado } : {};
    return this.http.post<{ id: number; estado: string; notificado: boolean }>(`/api/pedidos/${id}/ack`, body);
  }

  approve(id: number, approve: boolean, reason?: string) {
    return this.http.post(`/api/pedidos/${id}/approve`, { approve, reason });
  }

  sendToPrint(
    id: number,
    payload: {
      material: string;
      widthMm: number;
      heightMm: number;
      copies?: number;
      printerName?: string;
    }
  ) {
    return this.http.post(`/api/pedidos/${id}/send-to-print`, payload);
  }
}

