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
  MaterialDistributionItem
} from '../../services/admin-analytics.service';

@Component({
  standalone: true,
  selector: 'app-admin-reporte-torta',
  imports: [CommonModule, IonContent, IonButton, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <button class="back" (click)="goBack()">&#8592;</button>
      <section class="detail-grid" *ngIf="!loading(); else loadingTpl">
        <div class="chart-panel">
          <canvas #chartCanvas></canvas>
        </div>
        <div class="info">
          <h1>Distribucion de productos vendidos en el mes</h1>
          <p>
            Participacion de ventas por material correspondiente a los pedidos creados durante el mes actual.
          </p>
          <div class="key-stats" *ngIf="items().length">
            <div class="stat">
              <span>Material lider</span>
              <strong>{{ items()[0]?.label || '-' }}</strong>
            </div>
            <div class="stat">
              <span>Participacion del lider</span>
              <strong>{{ formatPercentageValue(items()[0]?.percentage) }}%</strong>
            </div>
            <div class="stat">
              <span>Total de pedidos del mes</span>
              <strong>{{ totalOrders() }}</strong>
            </div>
          </div>
          <div class="actions">
            <ion-button (click)="exportPdf()">Exportar como PDF</ion-button>
            <ion-button fill="outline" (click)="exportPng()">Exportar como PNG</ion-button>
          </div>
        </div>
      </section>

      <section *ngIf="items().length" class="table-section">
        <h2>Detalle por material</h2>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th class="text-right">Pedidos</th>
              <th class="text-right">Ventas</th>
              <th class="text-right">% participacion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of items()">
              <td>{{ item.label }}</td>
              <td class="text-right">{{ item.orders }}</td>
              <td class="text-right">{{ formatCurrency(item.total) }}</td>
              <td class="text-right">{{ item.percentage.toFixed(1) }}%</td>
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
        grid-template-columns: minmax(280px, 1.2fr) 1fr;
        gap: 28px;
        align-items: stretch;
      }
      .chart-panel {
        background: #0f172a;
        border-radius: 18px;
        padding: 24px;
        min-height: 340px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.35);
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
      .key-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }
      .stat {
        background: #f8fafc;
        border-radius: 12px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .stat span {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
      }
      .stat strong {
        font-size: 18px;
        color: #0f172a;
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
          min-height: 280px;
        }
      }
    `
  ]
})
export class AdminReporteTortaPage implements AfterViewInit, OnDestroy {
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
  readonly items = signal<MaterialDistributionItem[]>([]);

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

  totalOrders(): number {
    return this.items().reduce((acc, item) => acc + item.orders, 0);
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value || 0);
  }

  formatPercentageValue(value: number | null | undefined): string {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return numeric.toFixed(1);
  }

  async exportPng(): Promise<void> {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL('image/png', 1);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'distribucion-materiales.png';
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
      const pdf = new mod.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const image = await this.loadImage(dataUrl);
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 36;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / image.width, maxH / image.height);
      const w = image.width * ratio;
      const h = image.height * ratio;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(dataUrl, 'PNG', x, y, w, h);
      pdf.setFontSize(12);
      pdf.text('Distribucion de productos vendidos en el mes', margin, margin - 10);
      pdf.save('reporte-distribucion.pdf');
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
      this.items.set(overview.materialDistribution);
      setTimeout(() => this.renderChart(), 0);
    } catch (error) {
      console.error('No se pudo cargar el reporte de distribucion', error);
      this.error.set('No logramos cargar los datos. Vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderChart(): void {
    const canvas = this.chartCanvas?.nativeElement;
    const items = this.items();
    if (!canvas || !items.length) {
      return;
    }
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: items.map(item => item.label),
        datasets: [
          {
            data: items.map(item => item.total),
            backgroundColor: this.palette(items.length),
            borderWidth: 4,
            borderColor: '#0f172a'
          }
        ]
      },
      options: {
        responsive: true,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#fff',
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              label: context => {
                const value = context.parsed as number;
                const percentage = items[context.dataIndex]?.percentage ?? 0;
                return `${context.label}: ${this.formatCurrency(value)} (${percentage.toFixed(1)}%)`;
              }
            }
          }
        }
      }
    });
    this.chart.resize();
  }

  private palette(length: number): string[] {
    const base = ['#38bdf8', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#f59e0b', '#14b8a6', '#60a5fa', '#facc15', '#fb7185'];
    const result: string[] = [];
    for (let i = 0; i < length; i++) {
      result.push(base[i % base.length]);
    }
    return result;
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = dataUrl;
    });
  }
}
