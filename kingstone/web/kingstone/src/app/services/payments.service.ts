import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WebpayCreateResponse {
  pedidoId: number;
  buyOrder: string;
  amount: number;
  currency: string;
  token: string | null;
  url: string | null;
  returnUrl: string;
}

export interface WebpayCommitResponse {
  authorized: boolean;
  response: any;
  pedidoId?: number;
}

export interface TransferBankInfo {
  bankName: string;
  accountName: string;
  accountRut: string;
  accountNumber: string;
  accountType: string;
  instructions?: string;
}

export interface TransferPaymentRecord {
  id: number;
  clienteNombre: string | null;
  clienteEmail: string | null;
  estado: string;
  createdAt: string;
  total?: number | null;
  payload?: any;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private http = inject(HttpClient);

  createTransaction(payload: {
    pedidoId: number;
    amount?: number;
    returnUrl?: string;
  }): Observable<WebpayCreateResponse> {
    return this.http.post<WebpayCreateResponse>('/api/payments/webpay/create', payload);
  }

  commitTransaction(payload: {
    token?: string | null;
    token_ws?: string | null;
    TBK_TOKEN?: string | null;
  }): Observable<WebpayCommitResponse> {
    return this.http.post<WebpayCommitResponse>('/api/payments/webpay/commit', payload);
  }

  statusTransaction(payload: {
    token?: string | null;
    token_ws?: string | null;
    TBK_TOKEN?: string | null;
  }) {
    return this.http.post('/api/payments/webpay/status', payload);
  }

  getTransferInfo(): Observable<TransferBankInfo> {
    return this.http.get<TransferBankInfo>('/api/payments/transfer/info');
  }

  notifyTransfer(payload: FormData) {
    return this.http.post('/api/payments/transfer/notify', payload);
  }

  listTransferRequests(): Observable<TransferPaymentRecord[]> {
    return this.http.get<TransferPaymentRecord[]>('/api/payments/transfer/requests');
  }

  reviewTransfer(
    pedidoId: number,
    action: 'approve' | 'reject',
    note?: string | null
  ) {
    return this.http.post(
      `/api/payments/transfer/${pedidoId}/${action}`,
      note ? { note } : {}
    );
  }

  downloadTransferReceipt(pedidoId: number) {
    return this.http.get(`/api/payments/transfer/${pedidoId}/receipt`, { responseType: 'blob' });
  }
}
