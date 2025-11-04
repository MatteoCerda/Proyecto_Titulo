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
  PaymentFunnelStats
} from '../../services/admin-analytics.service';

type FunnelStageKey = 'pendientes' | 'enRevision' | 'porPagar' | 'enProduccion' | 'completados';

@Component({
  standalone: true,
  selector: 'app-admin-reporte-funnel',
  imports: [CommonModule, IonContent, IonButton, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <button class="back" (click)="goBack()">&#8592;</button>
      <section class="detail-grid" *ngIf="!loading(); else loadingTpl">
        <div class="chart-panel">
          <canvas #chartCanvas></canvas>
        </div>
        <div class="info" *ngIf="funnel() as data">
          <h1>Embudo hacia pago</h1>
          <p>
            Distribucion de pedidos del mes segun su estado dentro del proceso operativo. Sirve para monitorear cuellos
            de botella y tasas de conversion.
          </p>
          <div class="key-stats">
            <div class="stat">
              <span>Pedidos del mes</span>
              <strong>{{ data.total }}</strong>
            </div>
            <div class="stat">
              <span>Tasa a "Por pagar"</span>
              <strong>{{ data.porPagarRate | number: '1.0-1' }}%</strong>
            </div>
          </div>
          <div class="actions">
            <ion-button (click)="exportPdf()">Exportar como PDF</ion-button>
            <ion-button fill="outline" (click)="exportPng()">Exportar como PNG</ion-button>
          </div>
        </div>
      </section>

      <section *ngIf="funnel() as data" class="table-section">
        <h2>Detalle por etapa</h2>
        <table>
          <thead>
            <tr>
              <th>Etapa</th>
              <th class="text-right">Pedidos</th>
              <th class="text-right">% sobre total</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let stage of funnelStages">
              <td>{{ stage.label }}</td>
              <td class="text-right">{{ data[stage.key] }}</td>
              <td class="text-right">{{ stagePercent(data, stage.key) | number: '1.0-1' }}%</td>
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
        grid-template-columns: minmax(320px, 1.2fr) 1fr;
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
      .key-stats {
        display: flex;
        gap: 18px;
        margin-bottom: 18px;
        flex-wrap: wrap;
      }
      .stat {
        background: #f8fafc;
        border-radius: 12px;
        padding: 12px 18px;
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
        font-size: 24px;
        color: #0f172a;
      }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
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
export class AdminReporteFunnelPage implements AfterViewInit, OnDestroy {
  private readonly analytics = inject(AdminAnalyticsService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly funnel = signal<PaymentFunnelStats | null>(null);
  readonly funnelStages: ReadonlyArray<{ key: FunnelStageKey; label: string }> = [
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'enRevision', label: 'En revision' },
    { key: 'porPagar', label: 'Por pagar' },
    { key: 'enProduccion', label: 'En produccion' },
    { key: 'completados', label: 'Completados' }
  ];

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

  async exportPng(): Promise<void> {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL('image/png', 1);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'embudo-pagos.png';
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
      pdf.text('Embudo hacia pago - Pedidos del mes', margin, margin - 14);
      pdf.save('reporte-embudo-pagos.pdf');
    } catch (error) {
      console.error('No se pudo exportar el PDF', error);
      this.error.set('No pudimos generar el PDF. Intenta nuevamente.');
    }
  }

  stagePercent(funnel: PaymentFunnelStats, key: FunnelStageKey): number {
    if (!funnel.total) {
      return 0;
    }
    const value = funnel[key] ?? 0;
    if (!value) {
      return 0;
    }
    return Math.round((value / funnel.total) * 1000) / 10;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const overview = await this.analytics.loadOverview();
      this.funnel.set(overview.paymentFunnel);
      setTimeout(() => this.renderChart(), 0);
    } catch (error) {
      console.error('No se pudo cargar el reporte de embudo', error);
      this.error.set('No logramos cargar los datos. Vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderChart(): void {
    const canvas = this.chartCanvas?.nativeElement;
    const funnel = this.funnel();
    if (!canvas || !funnel || !funnel.total) {
      return;
    }
    const values = [funnel.pendientes, funnel.enRevision, funnel.porPagar, funnel.enProduccion, funnel.completados];
    if (!values.some(value => value > 0)) {
      return;
    }
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Pendientes', 'En revision', 'Por pagar', 'En produccion', 'Completados'],
        datasets: [
          {
            label: 'Pedidos',
            data: values,
            backgroundColor: ['#94a3b8', '#f59e0b', '#22c55e', '#6366f1', '#0f172a'],
            borderRadius: 14,
            maxBarThickness: 48
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            ticks: { color: '#0f172a' },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#0f172a' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `Pedidos: ${context.parsed.y as number}`
            }
          }
        }
      }
    });
    this.chart.resize();
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }
}
