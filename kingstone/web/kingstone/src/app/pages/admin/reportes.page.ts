import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import Chart from 'chart.js/auto';
import {
  AdminAnalyticsService,
  AdminDashboardOverview,
  ProductRankingItem,
  PaymentFunnelStats
} from '../../services/admin-analytics.service';

@Component({
  standalone: true,
  selector: 'app-admin-reportes',
  imports: [CommonModule, IonContent, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <header class="page-header">
        <div>
          <h1>Reportes y dashboards</h1>
          <p>Resumen visual del desempeno comercial. Haz clic sobre un grafico para ver el detalle y exportarlo.</p>
        </div>
        <button type="button" class="refresh" (click)="refresh()" [disabled]="loading()">Actualizar</button>
      </header>

      <section *ngIf="!loading(); else loadingTpl" class="dashboard-grid">
        <article class="report-card" (click)="open('distribucion')">
          <div class="img-wrap">
            <canvas #distributionCanvas></canvas>
          </div>
          <h3>Distribucion de productos vendidos en el mes</h3>
          <p>Participacion por material en base a los pedidos creados durante el mes actual.</p>
        </article>

        <article class="report-card" (click)="open('top-clientes')">
          <div class="img-wrap">
            <canvas #clientsCanvas></canvas>
          </div>
          <h3>Top 10 clientes del mes</h3>
          <p>Ranking de clientes ordenado por monto total de compra en el periodo vigente.</p>
        </article>

        <article class="report-card" (click)="open('ventas-mensuales')">
          <div class="img-wrap">
            <canvas #trendCanvas></canvas>
          </div>
          <h3>Evolucion de ventas mensuales</h3>
          <p>Tendencia de ventas y pedidos de los ultimos doce meses.</p>
        </article>

        <article class="report-card" (click)="open('top-productos')">
          <div class="img-wrap">
            <canvas #topProductsCanvas></canvas>
            <div class="no-data" *ngIf="!topProductsPreview().length">Sin datos para mostrar</div>
          </div>
          <h3>Top 10 productos del mes</h3>
          <p>Articulos con mayor cantidad solicitada durante el mes vigente.</p>
          <ul class="preview-list" *ngIf="topProductsPreview().length">
            <li *ngFor="let item of topProductsPreview()">
              <span class="label">{{ item.label }}</span>
              <span class="value">{{ item.quantity }} uds</span>
            </li>
          </ul>
        </article>

        <article class="report-card" (click)="open('productos-lentos')">
          <div class="img-wrap">
            <canvas #lowProductsCanvas></canvas>
            <div class="no-data" *ngIf="!lowProductsPreview().length">Sin datos para mostrar</div>
          </div>
          <h3>Productos con menor rotacion</h3>
          <p>Elementos con menor salida dentro del periodo actual.</p>
          <ul class="preview-list" *ngIf="lowProductsPreview().length">
            <li *ngFor="let item of lowProductsPreview()">
              <span class="label">{{ item.label }}</span>
              <span class="value">{{ item.quantity }} uds</span>
            </li>
          </ul>
        </article>

        <article class="report-card" (click)="open('embudo-pagos')">
          <div class="img-wrap">
            <canvas #funnelCanvas></canvas>
            <div class="no-data" *ngIf="!funnelPreview().length">Sin datos para mostrar</div>
          </div>
          <h3>Embudo hacia pago</h3>
          <p>Distribucion de pedidos del mes segun estado operativo.</p>
          <ul class="preview-list" *ngIf="funnelPreview().length">
            <li *ngFor="let item of funnelPreview()">
              <span class="label">{{ item.label }}</span>
              <span class="value">{{ item.count }} ({{ item.percent | number: '1.0-1' }}%)</span>
            </li>
          </ul>
        </article>
      </section>

      <p class="error" *ngIf="error()">{{ error() }}</p>
    </ion-content>

    <ng-template #loadingTpl>
      <div class="loading-state">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Cargando datos del tablero...</p>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
      }
      .page-header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        color: #0f172a;
      }
      .page-header p {
        margin: 4px 0 0;
        color: #475569;
      }
      .refresh {
        padding: 10px 18px;
        background: #0f172a;
        color: #fff;
        border: none;
        border-radius: 999px;
        cursor: pointer;
        font-weight: 600;
        letter-spacing: 0.03em;
      }
      .refresh:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 28px;
      }
      .report-card {
        display: flex;
        flex-direction: column;
        background: #fff;
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        transition: transform 120ms ease, box-shadow 120ms ease;
        cursor: pointer;
      }
      .report-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 24px 50px rgba(15, 23, 42, 0.16);
      }
      .img-wrap {
        background: #ffffff;
        border-radius: 14px;
        padding: 18px;
        height: 220px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.05);
        position: relative;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
        pointer-events: none;
      }
      .no-data {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: #94a3b8;
        letter-spacing: 0.02em;
        background: rgba(255, 255, 255, 0.82);
        border-radius: 14px;
      }
      h3 {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
      }
      p {
        margin: 0;
        color: #475569;
        line-height: 1.45;
      }
      .preview-list {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .preview-list li {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: #0f172a;
      }
      .preview-list .label {
        font-weight: 600;
        max-width: 70%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .preview-list .value {
        color: #475569;
        font-variant-numeric: tabular-nums;
      }
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 40px 0;
        color: #475569;
      }
      .error {
        margin-top: 20px;
        color: #dc2626;
        font-weight: 600;
      }
      @media (max-width: 960px) {
        .page-header {
          flex-direction: column;
          align-items: flex-start;
        }
        .img-wrap {
          height: 200px;
        }
      }
    `
  ]
})
export class AdminReportesPage implements AfterViewInit, OnDestroy {
  private readonly analytics = inject(AdminAnalyticsService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly topProductsPreview = signal<ProductRankingItem[]>([]);
  readonly lowProductsPreview = signal<ProductRankingItem[]>([]);
  readonly funnelPreview = signal<Array<{ label: string; count: number; percent: number }>>([]);
  readonly funnelStages: ReadonlyArray<{ key: 'pendientes' | 'enRevision' | 'porPagar' | 'enProduccion' | 'completados'; label: string }> = [
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'enRevision', label: 'En revision' },
    { key: 'porPagar', label: 'Por pagar' },
    { key: 'enProduccion', label: 'En produccion' },
    { key: 'completados', label: 'Completados' }
  ];

  private overview: AdminDashboardOverview | null = null;

  @ViewChild('distributionCanvas') private distributionCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('clientsCanvas') private clientsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendCanvas') private trendCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('topProductsCanvas') private topProductsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('lowProductsCanvas') private lowProductsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('funnelCanvas') private funnelCanvas?: ElementRef<HTMLCanvasElement>;

  private distributionChart?: Chart;
  private clientsChart?: Chart;
  private trendChart?: Chart;
  private topProductsChart?: Chart;
  private lowProductsChart?: Chart;
  private funnelChart?: Chart;

  async ngAfterViewInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    this.distributionChart?.destroy();
    this.clientsChart?.destroy();
    this.trendChart?.destroy();
    this.topProductsChart?.destroy();
    this.lowProductsChart?.destroy();
    this.funnelChart?.destroy();
  }

  async refresh(): Promise<void> {
    await this.load(true);
  }

  open(kind: 'distribucion' | 'top-clientes' | 'ventas-mensuales' | 'top-productos' | 'productos-lentos' | 'embudo-pagos'): void {
    this.router.navigateByUrl(`/admin/reportes/${kind}`);
  }

  private async load(force = false): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.overview = await this.analytics.loadOverview(force);
      setTimeout(() => this.renderPreviews(), 0);
    } catch (error) {
      console.error('No se pudo cargar el tablero de reportes', error);
      this.error.set('No pudimos obtener los datos. Intenta nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderPreviews(): void {
    if (!this.overview) {
      return;
    }
    this.renderDistributionPreview();
    this.renderClientsPreview();
    this.renderTrendPreview();
    this.renderTopProductsPreview();
    this.renderLowProductsPreview();
    this.renderFunnelPreview();
  }

  private renderDistributionPreview(): void {
    if (!this.distributionCanvas?.nativeElement || !this.overview?.materialDistribution.length) {
      return;
    }
    this.distributionChart?.destroy();
    const ctx = this.distributionCanvas.nativeElement;
    const data = this.overview.materialDistribution.slice(0, 6);
    this.distributionChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(item => item.label),
        datasets: [
          {
            data: data.map(item => item.total),
            backgroundColor: ['#38bdf8', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#f59e0b'],
            borderWidth: 3,
            borderColor: '#0f172a'
          }
        ]
      },
      options: {
        responsive: true,
        cutout: '50%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    this.distributionChart.resize();
  }

  private renderClientsPreview(): void {
    if (!this.clientsCanvas?.nativeElement || !this.overview?.topClients.length) {
      return;
    }
    this.clientsChart?.destroy();
    const ctx = this.clientsCanvas.nativeElement;
    const data = this.overview.topClients.slice(0, 5);
    this.clientsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(item => item.label),
        datasets: [
          {
            data: data.map(item => item.total),
            backgroundColor: '#60a5fa',
            borderRadius: 12,
            maxBarThickness: 24
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { display: false, grid: { display: false } }
        }
      }
    });
    this.clientsChart.resize();
  }

  private renderTrendPreview(): void {
    if (!this.trendCanvas?.nativeElement || !this.overview?.monthlyTrend.length) {
      return;
    }
    this.trendChart?.destroy();
    const ctx = this.trendCanvas.nativeElement;
    const data = this.overview.monthlyTrend.slice(-6);
    this.trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(point => point.shortLabel),
        datasets: [
          {
            data: data.map(point => point.total),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            tension: 0.35,
            borderWidth: 3,
            fill: true,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          y: { display: false, grid: { display: false } },
          x: { ticks: { color: '#fff' }, grid: { display: false } }
        }
      }
    });
    this.trendChart.resize();
  }

  private renderTopProductsPreview(): void {
    const all = this.overview?.topProducts ?? [];
    let dataset: ProductRankingItem[] = all.filter(item => (item.quantity ?? 0) > 0).slice(0, 5);
    if (!dataset.length && all.length) {
      dataset = all.filter(item => (item.total ?? 0) > 0).slice(0, 5);
    }
    if (!dataset.length && all.length) {
      dataset = all.slice(0, 5);
    }
    this.topProductsPreview.set(dataset);
    if (!this.topProductsCanvas?.nativeElement || !dataset.length) {
      this.topProductsChart?.destroy();
      return;
    }
    this.topProductsChart?.destroy();
    const ctx = this.topProductsCanvas.nativeElement;
    this.topProductsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dataset.map(item => item.label),
        datasets: [
          {
            data: dataset.map(item => item.quantity),
            backgroundColor: '#22c55e',
            borderRadius: 12,
            maxBarThickness: 24
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { display: false, grid: { display: false } }
        }
      }
    });
    this.topProductsChart.resize();
  }

  private renderLowProductsPreview(): void {
    const all = this.overview?.leastProducts ?? [];
    let dataset: ProductRankingItem[] = all.filter(item => (item.quantity ?? 0) > 0).slice(0, 5);
    if (!dataset.length && all.length) {
      dataset = all.filter(item => (item.total ?? 0) > 0).slice(0, 5);
    }
    if (!dataset.length && all.length) {
      dataset = all.slice(0, 5);
    }
    this.lowProductsPreview.set(dataset);
    if (!this.lowProductsCanvas?.nativeElement || !dataset.length) {
      this.lowProductsChart?.destroy();
      return;
    }
    this.lowProductsChart?.destroy();
    const ctx = this.lowProductsCanvas.nativeElement;
    this.lowProductsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dataset.map(item => item.label),
        datasets: [
          {
            data: dataset.map(item => item.quantity),
            backgroundColor: '#f97316',
            borderRadius: 12,
            maxBarThickness: 24
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { display: false, grid: { display: false } }
        }
      }
    });
    this.lowProductsChart.resize();
  }

  private renderFunnelPreview(): void {
    const funnel: PaymentFunnelStats | null = this.overview?.paymentFunnel ?? null;
    if (!funnel || !funnel.total) {
      this.funnelPreview.set([]);
      this.funnelChart?.destroy();
      return;
    }
    const preview = this.funnelStages.map(stage => {
      const count = funnel[stage.key] ?? 0;
      return {
        label: stage.label,
        count,
        percent: this.computePercent(funnel.total, count)
      };
    });
    this.funnelPreview.set(preview);
    const values = preview.map(item => item.count);
    if (!this.funnelCanvas?.nativeElement || !values.some(value => value > 0)) {
      this.funnelChart?.destroy();
      return;
    }
    this.funnelChart?.destroy();
    const ctx = this.funnelCanvas.nativeElement;
    this.funnelChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Pendientes', 'En revision', 'Por pagar', 'En produccion', 'Completados'],
        datasets: [
          {
            data: values,
            backgroundColor: ['#94a3b8', '#f59e0b', '#22c55e', '#6366f1', '#0f172a'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }
        ]
      },
      options: {
        responsive: true,
        cutout: '55%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    this.funnelChart.resize();
  }

  private computePercent(total: number, value: number): number {
    if (!total) {
      return 0;
    }
    return Math.round((value / total) * 1000) / 10;
  }
}

