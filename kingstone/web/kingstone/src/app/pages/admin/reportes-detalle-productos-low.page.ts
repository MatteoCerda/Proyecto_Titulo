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
  ProductRankingItem
} from '../../services/admin-analytics.service';

@Component({
  standalone: true,
  selector: 'app-admin-reporte-productos-low',
  imports: [CommonModule, IonContent, IonButton, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <button class="back" (click)="goBack()">&#8592;</button>
      <section class="detail-grid" *ngIf="!loading(); else loadingTpl">
        <div class="chart-panel">
          <canvas #chartCanvas></canvas>
        </div>
        <div class="info">
          <h1>Productos con menor rotacion</h1>
          <p>
            Listado de productos con menor nivel de movimiento durante el mes actual. Util para detectar articulos que
            requieren promociones o ajustes de inventario.
          </p>
          <div class="key-stats" *ngIf="products().length">
            <div class="stat">
              <span>Producto con menor salida</span>
              <strong>{{ products()[0]?.label || '-' }}</strong>
            </div>
            <div class="stat">
              <span>Unidades registradas</span>
              <strong>{{ products()[0]?.quantity || 0 }}</strong>
            </div>
            <div class="stat">
              <span>Ventas estimadas</span>
              <strong>{{ formatCurrency(products()[0]?.total || 0) }}</strong>
            </div>
          </div>
          <div class="actions">
            <ion-button (click)="exportPdf()">Exportar como PDF</ion-button>
            <ion-button fill="outline" (click)="exportPng()">Exportar como PNG</ion-button>
          </div>
        </div>
      </section>

      <section *ngIf="products().length" class="table-section">
        <h2>Detalle de productos</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              <th class="text-right">Unidades</th>
              <th class="text-right">Ventas</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let product of products(); index as idx">
              <td>{{ idx + 1 }}</td>
              <td>{{ product.label }}</td>
              <td class="text-right">{{ product.quantity }}</td>
              <td class="text-right">{{ formatCurrency(product.total) }}</td>
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
        grid-template-columns: minmax(320px, 1.3fr) 1fr;
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
export class AdminReporteProductosLowPage implements AfterViewInit, OnDestroy {
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
  readonly products = signal<ProductRankingItem[]>([]);

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

  async exportPng(): Promise<void> {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL('image/png', 1);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'productos-lentos.png';
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
      pdf.text('Productos con menor rotacion', margin, margin - 14);
      pdf.save('reporte-productos-lentos.pdf');
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
      this.products.set(overview.leastProducts);
      setTimeout(() => this.renderChart(), 0);
    } catch (error) {
      console.error('No se pudo cargar el reporte de productos lentos', error);
      this.error.set('No logramos cargar los datos. Vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderChart(): void {
    const canvas = this.chartCanvas?.nativeElement;
    const products = this.products();
    if (!canvas || !products.length) {
      return;
    }
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: products.map(product => product.label),
        datasets: [
          {
            label: 'Unidades',
            data: products.map(product => product.quantity),
            backgroundColor: '#f97316',
            borderRadius: 14,
            maxBarThickness: 36
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        scales: {
          x: {
            ticks: {
              color: '#0f172a'
            },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#0f172a' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `Unidades: ${context.parsed.x as number}`
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
