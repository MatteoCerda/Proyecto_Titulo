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
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import Chart from 'chart.js/auto';
import {
  AdminAnalyticsService,
  MonthlyTrendPoint
} from '../../services/admin-analytics.service';

@Component({
  standalone: true,
  selector: 'app-admin-reporte-lineas',
  imports: [CommonModule, IonContent, IonButton, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <button class="back" (click)="goBack()">&#8592;</button>
      <section class="detail-grid" *ngIf="!loading(); else loadingTpl">
        <div class="chart-panel">
          <canvas #chartCanvas></canvas>
        </div>
        <div class="info">
          <h1>Evolucion de ventas mensuales</h1>
          <p>
            Tendencia de los ultimos 12 meses mostrando ventas en CLP y cantidad de pedidos cerrados por mes.
            Puedes exportar el grafico para compartirlo con tu equipo o incluirlo en presentaciones.
          </p>
          <div class="summary" *ngIf="points().length">
            <div class="summary-card">
              <span>Mes con mayor venta</span>
              <strong>{{ bestMonth()?.label || '-' }}</strong>
              <small>{{ formatCurrency(bestMonth()?.total || 0) }}</small>
            </div>
            <div class="summary-card">
              <span>Mes con mayor numero de pedidos</span>
              <strong>{{ bestOrders()?.label || '-' }}</strong>
              <small>{{ bestOrders()?.orders || 0 }} pedidos</small>
            </div>
            <div class="summary-card">
              <span>Ventas acumuladas 12 meses</span>
              <strong>{{ formatCurrency(totalSales()) }}</strong>
            </div>
          </div>
          <div class="actions">
            <ion-button (click)="exportPdf()">Exportar como PDF</ion-button>
            <ion-button fill="outline" (click)="exportPng()">Exportar como PNG</ion-button>
          </div>
        </div>
      </section>

      <section *ngIf="points().length" class="table-section">
        <h2>Detalle mensual</h2>
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th class="text-right">Pedidos</th>
              <th class="text-right">Ventas</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let point of points()">
              <td>{{ point.label }}</td>
              <td class="text-right">{{ point.orders }}</td>
              <td class="text-right">{{ formatCurrency(point.total) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <p class="error" *ngIf="error()">{{ error() }}</p>
    </ion-content>

    <ng-template #loadingTpl>
      <div class="loading-state">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Cargando informacion del reporte...</p>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .back {
        background: none;
        border: 0;
        font-size: 28px;
        cursor: pointer;
        color: #0f172a;
        margin-bottom: 16px;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: minmax(340px, 1.4fr) 1fr;
        gap: 28px;
        align-items: stretch;
      }
      .chart-panel {
        background: #ffffff;
        border-radius: 18px;
        padding: 28px;
        min-height: 420px;
        box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
      .info h1 {
        font-size: 32px;
        margin: 0 0 12px;
        font-weight: 800;
        color: #0f172a;
      }
      .info p {
        margin: 0 0 18px;
        color: #475569;
        line-height: 1.6;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }
      .summary-card {
        background: #f8fafc;
        border-radius: 12px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .summary-card span {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
      }
      .summary-card strong {
        font-size: 18px;
        color: #0f172a;
      }
      .summary-card small {
        font-size: 13px;
        color: #475569;
      }
      .actions {
        display: flex;
        gap: 12px;
      }
      .table-section {
        margin-top: 36px;
      }
      .table-section h2 {
        font-size: 20px;
        margin-bottom: 12px;
        color: #0f172a;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      }
      th,
      td {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        font-size: 14px;
      }
      th {
        background: #f1f5f9;
        text-align: left;
        color: #475569;
        font-weight: 600;
      }
      .text-right {
        text-align: right;
      }
      tbody tr:last-child td {
        border-bottom: none;
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
        .detail-grid {
          grid-template-columns: 1fr;
        }
        .chart-panel {
          min-height: 360px;
        }
      }
    `
  ]
})
export class AdminReporteLineasPage implements AfterViewInit, OnDestroy {
  private readonly analytics = inject(AdminAnalyticsService);
  private readonly router = inject(Router);
  private readonly currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly points = signal<MonthlyTrendPoint[]>([]);

  @ViewChild('chartCanvas') private chartCanvas?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  async ngAfterViewInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  goBack(): void {
    this.router.navigateByUrl('/admin/reportes');
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value || 0);
  }

  totalSales(): number {
    return this.points().reduce((acc, point) => acc + point.total, 0);
  }

  bestMonth(): MonthlyTrendPoint | null {
    return this.points().reduce<MonthlyTrendPoint | null>((best, current) => {
      if (!best || current.total > best.total) {
        return current;
      }
      return best;
    }, null);
  }

  bestOrders(): MonthlyTrendPoint | null {
    return this.points().reduce<MonthlyTrendPoint | null>((best, current) => {
      if (!best || current.orders > best.orders) {
        return current;
      }
      return best;
    }, null);
  }

  async exportPng(): Promise<void> {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL('image/png', 1);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'ventas-mensuales.png';
    link.click();
  }

  async exportPdf(): Promise<void> {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL('image/png', 1);
    try {
      const mod: any = await import('jspdf').catch(() => null);
      if (!mod?.jsPDF) {
        throw new Error('jsPDF no disponible');
      }
      const pdf = new mod.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const image = await this.loadImage(dataUrl);
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / image.width, maxH / image.height);
      const w = image.width * ratio;
      const h = image.height * ratio;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(dataUrl, 'PNG', x, y, w, h);
      pdf.setFontSize(12);
      pdf.text('Evolucion de ventas mensuales', margin, margin - 14);
      pdf.save('reporte-ventas-mensuales.pdf');
    } catch (error) {
      console.error('No se pudo exportar el PDF', error);
      this.error.set('No pudimos generar el PDF. Intenta nuevamente.');
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const overview = await this.analytics.loadOverview();
      this.points.set(overview.monthlyTrend);
      setTimeout(() => this.renderChart(), 0);
    } catch (error) {
      console.error('No se pudo cargar el reporte de ventas mensuales', error);
      this.error.set('No logramos cargar los datos. Vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderChart(): void {
    const canvas = this.chartCanvas?.nativeElement;
    const points = this.points();
    if (!canvas || !points.length) {
      return;
    }
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map(point => point.label),
        datasets: [
          {
            label: 'Ventas (CLP)',
            data: points.map(point => point.total),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            tension: 0.35,
            borderWidth: 4,
            pointRadius: 5,
            pointBackgroundColor: '#38bdf8',
            fill: true
          },
          {
            label: 'Pedidos',
            data: points.map(point => point.orders),
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.18)',
            tension: 0.35,
            borderWidth: 3,
            borderDash: [8, 6],
            pointRadius: 4,
            pointBackgroundColor: '#f97316',
            fill: true,
            yAxisID: 'orders'
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            ticks: {
              callback: (value: number | string) => this.formatCurrency(Number(value)),
              color: '#0f172a'
            },
            grid: { color: 'rgba(15, 23, 42, 0.08)' }
          },
          orders: {
            position: 'right',
            ticks: { color: '#0f172a' },
            grid: { drawOnChartArea: false }
          },
          x: {
            ticks: { color: '#0f172a' }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#0f172a', usePointStyle: true }
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
    this.chart.resize();
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = dataUrl;
    });
  }
}
