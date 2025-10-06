import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);

  approve(id: number, approve: boolean, reason?: string) {
    return this.http.post(`/api/pedidos/${id}/approve`, { approve, reason });
  }

  sendToPrint(id: number, payload: {
    material: string; widthMm: number; heightMm: number; copies?: number; printerName?: string;
  }) {
    return this.http.post(`/api/pedidos/${id}/send-to-print`, payload);
  }
}
