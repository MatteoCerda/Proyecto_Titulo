import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface MaterialDistributionItem {
  label: string;
  total: number;
  orders: number;
  percentage: number;
}

export interface TopClientItem {
  rank: number;
  label: string;
  email: string | null;
  total: number;
  orders: number;
  percentage: number;
}

export interface MonthlyTrendPoint {
  key: string;
  label: string;
  shortLabel: string;
  month: number;
  year: number;
  total: number;
  orders: number;
}

export interface ProductRankingItem {
  label: string;
  quantity: number;
  total: number;
}

export interface PaymentFunnelStats {
  total: number;
  pendientes: number;
  enRevision: number;
  porPagar: number;
  enProduccion: number;
  completados: number;
  porPagarRate: number;
}

export interface AdminDashboardOverview {
  generatedAt: string;
  range: {
    monthlyStart: string;
    monthlyEnd: string;
    yearlyStart: string;
    yearlyEnd: string;
  };
  totals: {
    monthlySales: number;
    monthlyOrders: number;
    averageTicket: number;
    monthlyGrowth: number | null;
    rollingYearSales: number;
  };
  materialDistribution: MaterialDistributionItem[];
  topClients: TopClientItem[];
  monthlyTrend: MonthlyTrendPoint[];
  topProducts: ProductRankingItem[];
  leastProducts: ProductRankingItem[];
  paymentFunnel: PaymentFunnelStats;
}

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private readonly http = inject(HttpClient);
  private cache: AdminDashboardOverview | null = null;
  private inFlight?: Promise<AdminDashboardOverview>;

  async loadOverview(force = false): Promise<AdminDashboardOverview> {
    if (!force && this.cache) {
      return this.cache;
    }
    if (!force && this.inFlight) {
      return this.inFlight;
    }
    const request = firstValueFrom(
      this.http.get<AdminDashboardOverview>('/api/admin/dashboard/overview')
    );
    this.inFlight = request;
    try {
      const result = await request;
      const normalized: AdminDashboardOverview = {
        ...result,
        topProducts: (result.topProducts ?? []).map(item => ({
          label: item.label,
          quantity: item.quantity ?? 0,
          total: item.total ?? 0
        })),
        leastProducts: (result.leastProducts ?? []).map(item => ({
          label: item.label,
          quantity: item.quantity ?? 0,
          total: item.total ?? 0
        })),
        paymentFunnel: {
          total: result.paymentFunnel?.total ?? 0,
          pendientes: result.paymentFunnel?.pendientes ?? 0,
          enRevision: result.paymentFunnel?.enRevision ?? 0,
          porPagar: result.paymentFunnel?.porPagar ?? 0,
          enProduccion: result.paymentFunnel?.enProduccion ?? 0,
          completados: result.paymentFunnel?.completados ?? 0,
          porPagarRate: result.paymentFunnel?.porPagarRate ?? 0
        }
      };
      this.cache = normalized;
      return normalized;
    } finally {
      this.inFlight = undefined;
    }
  }

  clearCache(): void {
    this.cache = null;
  }
}
