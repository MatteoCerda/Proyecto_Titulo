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
  AdminDashboardOverview
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
        background: #0f172a;
        border-radius: 14px;
        padding: 18px;
        height: 220px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
        pointer-events: none;
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

  private overview: AdminDashboardOverview | null = null;

  @ViewChild('distributionCanvas') private distributionCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('clientsCanvas') private clientsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendCanvas') private trendCanvas?: ElementRef<HTMLCanvasElement>;

  private distributionChart?: Chart;
  private clientsChart?: Chart;
  private trendChart?: Chart;

  async ngAfterViewInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    this.distributionChart?.destroy();
    this.clientsChart?.destroy();
    this.trendChart?.destroy();
  }

  async refresh(): Promise<void> {
    await this.load(true);
  }

  open(kind: 'distribucion' | 'top-clientes' | 'ventas-mensuales'): void {
    this.router.navigateByUrl(`/admin/reportes/${kind}`);
  }

  private async load(force = false): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.overview = await this.analytics.loadOverview(force);
      queueMicrotask(() => this.renderPreviews());
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
  }
}

