import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-admin-reporte-barras',
  imports: [CommonModule, IonContent, IonButton],
  template: `
  <ion-content class="ion-padding">
    <button class="back" (click)="back()">←</button>
    <div class="detail-grid">
      <div class="img-wrap"><img src="assets/grafico-barras.png" alt="Top 10 clientes del mes"></div>
      <div class="info">
        <h1>Top 10 clientes del mes de mayor a menor</h1>
        <p>Ranking de los 10 clientes con mayor volumen de compras en el mes, destacando sus montos totales y permitiendo identificar a los principales generadores de ingresos.</p>
        <div class="actions">
          <ion-button (click)="exportPDF('assets/grafico-barras.png','top-clientes')">Exportar como PDF</ion-button>
          <ion-button fill="outline" (click)="exportPNG('assets/grafico-barras.png','top-clientes')">Exportar como PNG</ion-button>
        </div>
      </div>
    </div>
  </ion-content>
  `,
  styles: [
    `
    .back { background:none; border:0; font-size:24px; cursor:pointer; }
    .detail-grid{ display:grid; grid-template-columns: 1.1fr 1fr; gap:24px; align-items:center; }
    .img-wrap{ background:#062a3d; padding:18px; border-radius:6px; box-shadow:0 2px 10px rgba(0,0,0,.08); }
    .img-wrap img{ width:100%; height:auto; display:block; object-fit:contain; }
    .info h1{ font-size:28px; font-weight:800; margin:0 0 10px; }
    .info p{ color:#334155; line-height:1.5; }
    .actions{ display:flex; gap:12px; margin-top:16px; }
    @media(max-width:900px){ .detail-grid{ grid-template-columns:1fr; } }
    `
  ]
})
export class AdminReporteBarrasPage {
  constructor(private router: Router) {}
  back(){ this.router.navigateByUrl('/admin/reportes'); }
  exportPNG(src: string, name: string){ const a = document.createElement('a'); a.href = src; a.download = `${name}.png`; a.click(); }
  exportPDF(src: string, name: string){ const w = window.open('', '_blank'); if(!w) return; w.document.write(`<html><head><title>${name}</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${src}" style="max-width:100%;max-height:100vh;"/></body></html>`); w.document.close(); w.focus(); setTimeout(()=>w.print(),300); }
}

