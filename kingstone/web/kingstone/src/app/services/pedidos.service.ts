import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WorkOrderSummary {
  id: number;
  pedidoId: number;
  tecnica: string;
  maquina?: string | null;
  estado: string;
  programadoPara?: string | null;
  iniciaEn?: string | null;
  terminaEn?: string | null;
  notas?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PedidoResumen {
  id: number;
  cliente: string;
  email: string;
  estado: string;
  createdAt: string;
  total?: number;
  subtotal?: number;
  taxTotal?: number;
  currency?: string;
  items?: number;
  notificado?: boolean;
  materialLabel?: string;
  note?: string;
  payload?: any;
  workOrder?: WorkOrderSummary | null;
  receiptAvailable?: boolean;
}

export interface PedidoAttachment {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  widthCm?: number;
  lengthCm?: number;
  areaCm2?: number;
  createdAt: string;
}

export interface ClientePedidosResumen {
  id: number;
  email: string | null;
  nombre: string | null;
  rut?: string | null;
  rutNormalizado?: string | null;
  pedidos: Array<{
    id: number;
    estado: string;
    createdAt: string;
    total: number | null;
    subtotal: number | null;
    taxTotal: number | null;
    currency: string | null;
    material: string | null;
  }>;
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

export interface OperatorClienteSearchResult {
  found: boolean;
  cliente?: {
    id: number;
    rut: string | null;
    estado: string;
    nombre: string | null;
    email: string | null;
    telefono: string | null;
    claimExpiresAt?: string | null;
    claimIssuedAt?: string | null;
    hasAccount: boolean;
    tipoRegistro?: string | null;
  };
  resumen?: {
    total?: number | null;
    itemsCount?: number | null;
  };
}

export interface OperatorSaleResumenItem {
  itemId: number;
  name: string;
  quantity: number;
  itemType?: string | null;
  provider?: string | null;
  pricePresencial?: number | null;
  priceWsp?: number | null;
  selectedUnitPrice?: number | null;
}

export interface OperatorSalePayload {
  canal: 'presencial' | 'wsp';
  cliente: {
    rut?: string | null;
    nombre?: string | null;
    email?: string | null;
    telefono?: string | null;
  };
  resumen: {
    materialId?: string | null;
    materialLabel?: string | null;
    total: number;
    itemsCount?: number | null;
    note?: string | null;
    dtfMetros?: number | null;
    dtfCentimetros?: number | null;
    dtfCategoria?: 'dtf' | 'textil' | 'uv' | 'tela' | 'pvc' | 'sticker' | 'comprinter';
    comprinterMaterial?: 'pvc' | 'pu';
    adjuntoRequerido?: boolean;
    items?: OperatorSaleResumenItem[];
  };
  agenda?: {
    fecha: string;
    hora?: string | null;
    tecnica?: string | null;
    maquina?: string | null;
    notas?: string | null;
  };
}

export interface OperatorSaleResponse {
  id: number;
  cliente: {
    id: number;
    estado: string;
    hasAccount: boolean;
  };
  claimCode?: string | null;
  claimExpiresAt?: string | null;
  workOrder?: WorkOrderSummary | null;
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

  listAttachments(pedidoId: number): Observable<PedidoAttachment[]> {
    return this.http.get<PedidoAttachment[]>(`/api/pedidos/${pedidoId}/files`);
  }

  uploadAttachments(pedidoId: number, files: File[]): Observable<{ ok: boolean; created: any[]; errors: any[] }> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return this.http.post<{ ok: boolean; created: any[]; errors: any[] }>(`/api/pedidos/${pedidoId}/files`, formData);
  }

  downloadCotizacionPdf(pedidoId: number) {
    return this.http.get(`/api/pedidos/${pedidoId}/quote.pdf`, { responseType: 'blob' });
  }

  downloadAttachment(pedidoId: number, fileId: number) {
    return this.http.get(`/api/pedidos/${pedidoId}/files/${fileId}`, { responseType: 'blob' });
  }

  downloadReceipt(pedidoId: number) {
    return this.http.get(`/api/pedidos/${pedidoId}/receipt.pdf`, { responseType: 'blob' });
  }

  listClientesResumen(): Observable<ClientePedidosResumen[]> {
    return this.http.get<ClientePedidosResumen[]>(`/api/pedidos/admin/clientes`);
  }

  getDashboardTotals(): Observable<{ day: number; week: number; month: number }> {
    return this.http.get<{ day: number; week: number; month: number }>(
      `/api/pedidos/admin/dashboard/totals`
    );
  }

  createWorkOrder(
    pedidoId: number,
    payload: { tecnica: string; maquina?: string | null; programadoPara?: string | null; notas?: string | null }
  ): Observable<WorkOrderSummary> {
    return this.http.post<WorkOrderSummary>(`/api/pedidos/${pedidoId}/work-orders`, payload);
  }

  updateWorkOrder(
    workOrderId: number,
    payload: Partial<{ estado: string; maquina: string | null; programadoPara: string | null; notas: string | null; iniciaEn: string | null; terminaEn: string | null }>
  ): Observable<WorkOrderSummary> {
    return this.http.patch<WorkOrderSummary>(`/api/pedidos/work-orders/${workOrderId}`, payload);
  }

  listWorkOrdersCalendar(params?: { from?: string; to?: string }): Observable<Array<
    WorkOrderSummary & {
      pedido: {
        id: number;
        clienteNombre: string | null;
        clienteEmail: string | null;
        estado: string;
        materialLabel: string | null;
      };
    }
  >> {
    const httpParams: Record<string, string> = {};
    if (params?.from) {
      httpParams['from'] = params.from;
    }
    if (params?.to) {
      httpParams['to'] = params.to;
    }
    return this.http.get<Array<
    WorkOrderSummary & {
      pedido: {
        id: number;
        clienteNombre: string | null;
        clienteEmail: string | null;
        estado: string;
        materialLabel: string | null;
      };
    }
  >>(`/api/pedidos/work-orders/calendar`, { params: httpParams });
  }

  searchClienteByRut(rut: string): Observable<OperatorClienteSearchResult> {
    return this.http.get<OperatorClienteSearchResult>(`/api/operator/clientes/search`, { params: { rut } });
  }

  createOperatorSale(payload: OperatorSalePayload): Observable<OperatorSaleResponse> {
    return this.http.post<OperatorSaleResponse>(`/api/operator/ventas`, payload);
  }
}

