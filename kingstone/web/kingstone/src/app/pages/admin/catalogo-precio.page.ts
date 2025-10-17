import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { IonContent } from '@ionic/angular/standalone';

interface Producto {
  id: number;
  code: string;
  name: string;
  itemType: string;
  color: string;
  provider: string;
  quantity: number;
  priceWeb: number;
  priceStore: number;
  priceWsp: number;
  umbralBajoStock: number;
  imageUrl?: string | null;
}

@Component({
  standalone: true,
  selector: 'app-admin-catalogo-precio',
  imports: [CommonModule, IonContent],
  template: `
  <ion-content class="catalogo">
    <div class="wrap">
      <h2>Productos</h2>

      <div class="acciones">
        <button class="btn secondary sm" type="button" (click)="cargar()" [disabled]="cargando">
          <span *ngIf="!cargando">Refrescar</span>
          <span *ngIf="cargando">Cargando...</span>
        </button>
      </div>

      <div class="vacio" *ngIf="!cargando && productos().length === 0">
        No hay productos en el inventario. Agrega items en "Administrar stock" y aparecerán aquí.
      </div>

      <div class="grid" *ngIf="productos().length > 0">
        <div class="card" *ngFor="let p of productos()" [class.low]="p.umbralBajoStock > 0 && p.quantity <= p.umbralBajoStock">
          <div class="img">
            <ng-container *ngIf="imagen(p) as img; else sinImg">
              <img [src]="img" alt="Imagen de {{p.name}}" />
            </ng-container>
            <ng-template #sinImg>
              <div class="placeholder">Sin imagen</div>
            </ng-template>
            <div class="low-overlay" *ngIf="p.umbralBajoStock > 0 && p.quantity <= p.umbralBajoStock">
              <div class="low-msg">
                El stock de este producto es bajo.
                Se recomienda gestionar reposición.
              </div>
            </div>
          </div>
          <div class="titulo">{{ p.name }}</div>
          <div class="meta">{{ p.itemType }} | {{ p.color }} | {{ p.provider }}</div>
          <div class="prices">
            <div><span>Web:</span> {{ p.priceWeb | currency:'CLP':'symbol-narrow':'1.0-0' }}</div>
            <div><span>Presencial:</span> {{ p.priceStore | currency:'CLP':'symbol-narrow':'1.0-0' }}</div>
            <div><span>WhatsApp:</span> {{ p.priceWsp | currency:'CLP':'symbol-narrow':'1.0-0' }}</div>
          </div>
          <button type="button" class="btn primary block" (click)="editar(p)">Editar producto</button>
        </div>
      </div>
    </div>
  </ion-content>
  `,
  styles: [
    `
    .catalogo { --padding-start:16px; --padding-end:16px; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 16px 0 36px; }
    h2 { text-align:center; margin: 6px 0 18px; font-size: 22px; font-weight: 700; }
    .acciones { display:flex; justify-content:flex-end; margin-bottom:12px; }
    .btn { background:#0c4a6e; color:#fff; border:0; padding:8px 14px; border-radius:999px; cursor:pointer; font-weight:600; }
    .btn.secondary { background:#475569; }
    .btn.sm { padding:6px 12px; font-size:13px; }
    .btn.primary { background:#0ea5e9; }
    .btn.block { display:block; width:calc(100% - 24px); margin:12px; border-radius:10px; }
    .btn.block:hover { filter:brightness(0.95); }
    .vacio { text-align:center; color:#64748b; padding:24px; }

    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .card { background:#ffffff; border-radius:12px; box-shadow: 0 8px 18px rgba(2, 6, 23, 0.08); overflow:hidden; border:1px solid #e2e8f0; }
    .img { position:relative; aspect-ratio: 4 / 3; background:#0f172a; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .img img { width:100%; height:100%; object-fit:cover; display:block; }
    .placeholder { color:#94a3b8; font-size:12px; }
    .low-overlay { position:absolute; inset:0; z-index: 2; display:flex; align-items:center; justify-content:center; padding:14px; background:rgba(2,6,23,0.55); color:#fff; text-align:center; pointer-events:none; }
    .low-msg { font-weight:700; line-height:1.25; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
    .titulo { font-weight:700; padding:10px 12px 2px; color:#0f172a; }
    .meta { color:#475569; font-size:12.5px; padding:0 12px 6px; }
    .prices { padding:0 12px 12px; font-size:13px; color:#0f172a; display:flex; flex-direction:column; gap:4px; }
    .prices span { font-weight:600; display:inline-block; min-width:84px; color:#1e293b; }
    `
  ]
})
export class AdminCatalogoPrecioPage {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  productos = signal<Producto[]>([]);
  cargando = false;

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando = true;
    this.http.get<Producto[]>(`http://localhost:3000/admin/inventory`).subscribe({
      next: (items) => { this.productos.set(items); this.cargando = false; },
      error: () => { this.cargando = false; }
    });
  }

  imagen(p: Producto): SafeUrl | null {
    if (!p.imageUrl) return null;
    return this.sanitizer.bypassSecurityTrustUrl(p.imageUrl);
  }

  editar(item: Producto) {
    this.router.navigate(['/admin/catalogo', item.id], { state: { item } });
  }
}
