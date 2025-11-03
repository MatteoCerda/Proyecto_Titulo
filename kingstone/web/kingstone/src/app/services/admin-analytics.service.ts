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
      this.cache = result;
      return result;
    } finally {
      this.inFlight = undefined;
    }
  }

  clearCache(): void {
    this.cache = null;
  }
}
