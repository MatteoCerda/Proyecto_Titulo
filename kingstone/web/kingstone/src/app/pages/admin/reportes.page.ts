import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-admin-reportes',
  imports: [CommonModule, IonContent],
  template: `
  <ion-content class="ion-padding">
    <div class="dashboard-grid">
      <div class="report-card clickable" (click)="open('distribucion')">
        <div class="img-wrap">
          <img src="assets/grafico-torta.png" alt="Distribución de productos vendidos en el mes"/>
        </div>
        <h3>Distribución de productos vendidos en el mes</h3>
        <p>Distribución de productos vendidos en el mes, mostrando el porcentaje de participación de cada tipo de vinilo e insumos.</p>
      </div>

      <div class="report-card clickable" (click)="open('top-clientes')">
        <div class="img-wrap">
          <img src="assets/grafico-barras.png" alt="Top 10 clientes del mes"/>
        </div>
        <h3>Top 10 clientes del mes</h3>
        <p>Ranking de los 10 clientes con mayor volumen de compras en el mes, destacando sus montos totales.</p>
      </div>

      <div class="report-card clickable" (click)="open('ventas-mensuales')">
        <div class="img-wrap">
          <img src="assets/grafico-lineas.png" alt="Evolución de ventas mensuales"/>
        </div>
        <h3>Evolución de ventas mensuales</h3>
        <p>Tendencia de las ventas a lo largo del año, mostrando los meses de mayor crecimiento.</p>
      </div>
    </div>
  </ion-content>
  `,
  styles: [
    `
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
    }
    .report-card { display: flex; flex-direction: column; }
    .report-card .img-wrap {
      background: #062a3d; /* mismo tono que header admin */
      border-radius: 6px;
      padding: 18px;
      height: 320px;               /* altura fija para uniformidad */
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,.08);
    }
    .report-card img { width: 100%; height: 100%; display:block; object-fit: contain; }
    .report-card h3 { margin: 14px 6px 6px; font-size: 16px; font-weight: 700; color: #0d1720; }
    .report-card p { margin: 0 6px; font-size: 14px; color: #334155; line-height: 1.45; }
    .clickable { cursor: pointer; }

    @media (max-width: 1100px) {
      .dashboard-grid { grid-template-columns: 1fr 1fr; }
      .report-card .img-wrap { height: 280px; }
    }
    @media (max-width: 700px) {
      .dashboard-grid { grid-template-columns: 1fr; }
      .report-card .img-wrap { height: 240px; }
    }
    `
  ]
})
export class AdminReportesPage {
  private router = inject(Router);
  open(kind: 'distribucion'|'top-clientes'|'ventas-mensuales') {
    this.router.navigateByUrl(`/admin/reportes/${kind}`);
  }
}
