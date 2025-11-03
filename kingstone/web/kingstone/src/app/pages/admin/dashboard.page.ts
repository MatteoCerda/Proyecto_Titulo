import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonSpinner,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import Chart from 'chart.js/auto';
import {
  AdminAnalyticsService,
  AdminDashboardOverview
} from '../../services/admin-analytics.service';

addIcons({ refreshOutline });

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle, IonButton, IonSpinner, IonIcon],
  template: `
    <ion-header>
      <ion-toolbar color="warning">
        <ion-title>Panel de administracion</ion-title>
        <ion-button slot="end" fill="clear" (click)="refresh()" [disabled]="loading()">
          <ion-icon slot="start" name="refresh-outline"></ion-icon>
          <span>Actualizar</span>
        </ion-button>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <section class="summary" *ngIf="overview() as data; else loadingTpl">
        <div class="summary-card">
          <span>Ventas del mes</span>
          <strong>{{ formatCurrency(data.totals.monthlySales) }}</strong>
          <small *ngIf="data.totals.monthlyGrowth !== null">
            Variacion vs. mes anterior:
            <span
              [ngClass]="{
                up: data.totals.monthlyGrowth > 0,
                down: data.totals.monthlyGrowth < 0
              }"
            >
              {{ formatPercentage(data.totals.monthlyGrowth) }}
            </span>
          </small>
        </div>
        <div class="summary-card">
          <span>Pedidos del mes</span>
          <strong>{{ data.totals.monthlyOrders || 0 }}</strong>
          <small>Ticket promedio: {{ formatCurrency(data.totals.averageTicket) }}</small>
        </div>
        <div class="summary-card">
          <span>Ventas ultimos 12 meses</span>
          <strong>{{ formatCurrency(data.totals.rollingYearSales) }}</strong>
          <small>Actualizado: {{ updatedAtLabel() }}</small>
        </div>
      </section>

      <ng-container *ngIf="overview() as data">
        <section class="charts-grid">
          <article class="chart-card">
            <header>
              <h2>Distribucion de productos vendidos en el mes</h2>
              <p>Participacion por material de los pedidos creados durante el mes actual.</p>
            </header>
            <div class="chart-wrapper">
              <canvas #distributionChart></canvas>
            </div>
            <table class="chart-table" *ngIf="data.materialDistribution.length">
              <thead>
                <tr>
                  <th>Material</th>
                  <th class="text-right">Ventas</th>
                  <th class="text-right">% participacion</th>
                  <th class="text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of data.materialDistribution">
                  <td>{{ item.label }}</td>
                  <td class="text-right">{{ formatCurrency(item.total) }}</td>
                  <td class="text-right">{{ item.percentage.toFixed(1) }}%</td>
                  <td class="text-right">{{ item.orders }}</td>
                </tr>
              </tbody>
            </table>
          </article>

          <article class="chart-card">
            <header>
              <h2>Top 10 clientes del mes</h2>
              <p>Clientes con mayor monto de compra en el periodo actual.</p>
            </header>
            <div class="chart-wrapper">
              <canvas #topClientsChart></canvas>
            </div>
            <table class="chart-table" *ngIf="data.topClients.length">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th class="text-right">Pedidos</th>
                  <th class="text-right">Ventas</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let client of data.topClients">
                  <td>{{ client.label }}</td>
                  <td class="text-right">{{ client.orders }}</td>
                  <td class="text-right">{{ formatCurrency(client.total) }}</td>
                </tr>
              </tbody>
            </table>
          </article>

          <article class="chart-card">
            <header>
              <h2>Evolucion de ventas mensuales</h2>
              <p>Tendencia de los ultimos 12 meses con cantidad de pedidos por mes.</p>
            </header>
            <div class="chart-wrapper">
              <canvas #monthlyTrendChart></canvas>
            </div>
            <table class="chart-table trend-table" *ngIf="data.monthlyTrend.length">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th class="text-right">Pedidos</th>
                  <th class="text-right">Ventas</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let point of data.monthlyTrend">
                  <td>{{ point.label }}</td>
                  <td class="text-right">{{ point.orders }}</td>
                  <td class="text-right">{{ formatCurrency(point.total) }}</td>
                </tr>
              </tbody>
            </table>
          </article>
        </section>
      </ng-container>

      <ng-template #loadingTpl>
        <div class="loading-state">
          <ion-spinner name="crescent"></ion-spinner>
          <p>Cargando metricas del panel...</p>
        </div>
      </ng-template>

      <p class="error-message" *ngIf="error()">{{ error() }}</p>
    </ion-content>
  `,
  styles: [
    `
      ion-toolbar {
        --padding-start: 16px;
      }
      ion-toolbar ion-button {
        --color: #0f172a;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .summary-card {
        background: #0f172a;
        color: #fff;
        border-radius: 12px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
      }
      .summary-card span {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.85;
      }
      .summary-card strong {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .summary-card small {
        font-size: 13px;
        opacity: 0.85;
      }
      .summary-card small .up {
        color: #4ade80;
      }
      .summary-card small .down {
        color: #f87171;
      }
      .charts-grid {
        display: grid;
        gap: 28px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .chart-card {
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .chart-card header h2 {
        font-size: 18px;
        margin: 0 0 6px;
        font-weight: 700;
        color: #0f172a;
      }
      .chart-card header p {
        margin: 0;
        color: #475569;
        font-size: 14px;
      }
      .chart-wrapper {
        position: relative;
        min-height: 280px;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
      .chart-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        color: #0f172a;
      }
      .chart-table th {
        text-align: left;
        border-bottom: 1px solid rgba(148, 163, 184, 0.4);
        padding: 8px 4px;
        font-weight: 600;
        color: #475569;
      }
      .chart-table td {
        padding: 8px 4px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      }
      .chart-table tbody tr:last-child td {
        border-bottom: none;
      }
      .chart-table .text-right {
        text-align: right;
      }
      .trend-table tbody tr:nth-child(even) {
        background: rgba(148, 163, 184, 0.08);
      }
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 40px 0;
        color: #475569;
      }
      .error-message {
        margin-top: 18px;
        color: #dc2626;
        font-weight: 600;
      }
      @media (max-width: 960px) {
        .chart-card {
          padding: 16px;
        }
        .chart-wrapper {
          min-height: 240px;
        }
      }
    `
  ]
})
export class DashboardPage implements AfterViewInit, OnDestroy {
  private readonly analytics = inject(AdminAnalyticsService);
  private readonly currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  readonly overview = signal<AdminDashboardOverview | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  @ViewChild('distributionChart') private distributionChartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('topClientsChart') private topClientsChartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('monthlyTrendChart') private monthlyTrendChartCanvas?: ElementRef<HTMLCanvasElement>;

  private distributionChart?: Chart;
  private topClientsChart?: Chart;
  private monthlyTrendChart?: Chart;

  readonly updatedAtLabel = computed(() => {
    const data = this.overview();
    if (!data) {
      return '';
    }
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(data.generatedAt));
  });

  async ngAfterViewInit(): Promise<void> {
    await this.loadData();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  async refresh(): Promise<void> {
    await this.loadData(true);
  }

  formatCurrency(value: number | null | undefined): string {
    if (!value || Number.isNaN(value)) {
      return '$0';
    }
    return this.currencyFormatter.format(value);
  }

  formatPercentage(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '0%';
    }
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }

  private async loadData(force = false): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.analytics.loadOverview(force);
      this.overview.set(data);
      setTimeout(() => this.renderCharts(), 0);
    } catch (err) {
      console.error('No se pudo cargar el resumen del panel admin', err);
      this.error.set('No pudimos obtener las metricas. Intenta nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderCharts(): void {
    const data = this.overview();
    if (!data) {
      return;
    }
    this.renderDistributionChart(data);
    this.renderTopClientsChart(data);
    this.renderMonthlyTrendChart(data);
  }

  private renderDistributionChart(data: AdminDashboardOverview): void {
    const canvas = this.distributionChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    this.distributionChart?.destroy();
    if (!data.materialDistribution.length) {
      return;
    }
    const labels = data.materialDistribution.map(item => item.label);
    const values = data.materialDistribution.map(item => item.total);
    const backgroundColors = this.buildPalette(labels.length);
    this.distributionChart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: backgroundColors,
            borderColor: '#ffffff',
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label: context => {
                const value = context.parsed as number;
                const percentage = data.materialDistribution[context.dataIndex]?.percentage ?? 0;
                return `${context.label}: ${this.formatCurrency(value)} (${percentage.toFixed(1)}%)`;
              }
            }
          }
        }
      }
    });
    this.distributionChart.resize();
  }

  private renderTopClientsChart(data: AdminDashboardOverview): void {
    const canvas = this.topClientsChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    this.topClientsChart?.destroy();
    if (!data.topClients.length) {
      return;
    }
    this.topClientsChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.topClients.map(item => item.label),
        datasets: [
          {
            label: 'Ventas (CLP)',
            data: data.topClients.map(item => item.total),
            backgroundColor: '#1d4ed8',
            borderRadius: 12,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        scales: {
          x: {
            ticks: {
              callback: (value: number | string) => this.formatCurrency(Number(value))
            },
            grid: { display: false }
          },
          y: {
            ticks: {
              font: { size: 12 }
            },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => this.formatCurrency(context.parsed.x as number)
            }
          }
        }
      }
    });
    this.topClientsChart.resize();
  }

  private renderMonthlyTrendChart(data: AdminDashboardOverview): void {
    const canvas = this.monthlyTrendChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    this.monthlyTrendChart?.destroy();
    if (!data.monthlyTrend.length) {
      return;
    }
    this.monthlyTrendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.monthlyTrend.map(item => item.shortLabel),
        datasets: [
          {
            label: 'Ventas',
            data: data.monthlyTrend.map(item => item.total),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            tension: 0.35,
            fill: true,
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: '#1d4ed8'
          },
          {
            label: 'Pedidos',
            data: data.monthlyTrend.map(item => item.orders),
            borderColor: '#14b8a6',
            backgroundColor: 'rgba(20, 184, 166, 0.12)',
            tension: 0.35,
            fill: true,
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#0f766e',
            yAxisID: 'orders'
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: number | string) => this.formatCurrency(Number(value)),
              font: { size: 12 }
            }
          },
          orders: {
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 12 }
            }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              label: context => {
                if (context.dataset.label === 'Pedidos') {
                  return `${context.dataset.label}: ${context.parsed.y as number}`;
                }
                return `${context.dataset.label}: ${this.formatCurrency(context.parsed.y as number)}`;
              }
            }
          }
        }
      }
    });
    this.monthlyTrendChart.resize();
  }

  private buildPalette(length: number): string[] {
    const base = ['#0ea5e9', '#6366f1', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#f59e0b', '#475569', '#818cf8', '#fb7185', '#7e22ce'];
    const colors: string[] = [];
    for (let i = 0; i < length; i++) {
      colors.push(base[i % base.length]);
    }
    return colors;
  }

  private destroyCharts(): void {
    this.distributionChart?.destroy();
    this.topClientsChart?.destroy();
    this.monthlyTrendChart?.destroy();
  }
}

