import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

interface InventoryItemDetail {
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
  qrRaw?: string | null;
  imageUrl?: string | null;
}

@Component({
  standalone: true,
  selector: 'app-admin-catalogo-precio-detalle',
  imports: [CommonModule, ReactiveFormsModule, IonContent],
  template: `
  <ion-content class="detalle">
    <div class="wrap">
      <button class="back" type="button" (click)="volver()">&lt; Volver al catalogo</button>

      <h1>Editar producto</h1>

      <div class="loading" *ngIf="cargando()">Cargando datos...</div>

      <form *ngIf="!cargando()" [formGroup]="form" (ngSubmit)="guardar()">
        <section class="image-section">
          <div class="preview" *ngIf="imagePreview; else noImg">
            <img [src]="imagePreview" alt="Imagen del producto" />
            <button type="button" class="btn secondary sm" (click)="clearImage()" [disabled]="guardando()">Quitar imagen</button>
          </div>
          <ng-template #noImg>
            <div class="no-img">Sin imagen</div>
          </ng-template>
          <label class="file-input">
            Cambiar imagen
            <input type="file" accept="image/*" (change)="onImageFile($event)" [disabled]="guardando()" />
          </label>
        </section>
        <div class="form-grid">
          <label>
            Codigo
            <input type="text" formControlName="code" readonly />
          </label>
          <label>
            Nombre
            <input type="text" formControlName="name" readonly />
          </label>
          <label>
            Tipo
            <input type="text" formControlName="itemType" readonly />
          </label>
          <label>
            Color
            <input type="text" formControlName="color" readonly />
          </label>
          <label>
            Proveedor
            <input type="text" formControlName="provider" readonly />
          </label>
          <label>
            Stock disponible
            <input type="number" min="0" formControlName="quantity" readonly />
          </label>
          <label>
            Umbral bajo stock
            <input type="number" min="0" formControlName="umbralBajoStock" readonly />
          </label>
        </div>

        <fieldset class="prices">
          <legend>Precios</legend>
          <div class="price-grid">
            <label>
              Precio web
              <input type="number" min="0" formControlName="priceWeb" />
            </label>
            <label>
              Precio presencial
              <input type="number" min="0" formControlName="priceStore" />
            </label>
            <label>
              Precio WhatsApp
              <input type="number" min="0" formControlName="priceWsp" />
            </label>
          </div>
        </fieldset>

        <label>
          Texto QR (referencia)
          <textarea rows="3" formControlName="qrRaw" readonly></textarea>
        </label>

        <div class="alert error" *ngIf="error()">{{ error() }}</div>
        <div class="alert success" *ngIf="exito()">{{ exito() }}</div>

        <div class="actions">
          <button class="btn primary" type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando...' : 'Guardar cambios' }}</button>
          <button class="btn secondary" type="button" (click)="volver()" [disabled]="guardando()">Cancelar</button>
        </div>
      </form>
    </div>
  </ion-content>
  `,
  styles: [
    `
    .detalle { --padding-start:16px; --padding-end:16px; }
    .wrap { max-width:800px; margin:0 auto; padding:24px 0 48px; }
    .back { background:none; border:0; color:#0c4a6e; font-weight:600; cursor:pointer; margin-bottom:12px; }
    .back:hover { text-decoration:underline; }
    h1 { margin:0 0 18px; font-size:26px; font-weight:700; color:#0f172a; }
    form { background:#ffffff; padding:20px; border-radius:14px; box-shadow:0 18px 28px rgba(15,23,42,0.08); display:flex; flex-direction:column; gap:18px; }
    label { display:flex; flex-direction:column; gap:6px; font-size:14px; color:#1e293b; }
    input, textarea { background:#f8fafc; border:1px solid #cbd5f5; border-radius:8px; padding:10px 12px; font-size:14px; color:#0f172a; }
    input:focus, textarea:focus { outline:2px solid #0ea5e9; border-color:#0ea5e9; }
    textarea { resize:vertical; }
    .form-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:16px; }
    fieldset { border:1px solid #cbd5f5; border-radius:12px; padding:16px; }
    legend { padding:0 8px; font-weight:600; color:#0c4a6e; }
    .price-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:16px; }
    .alert { padding:10px 12px; border-radius:8px; font-size:14px; }
    .alert.error { background:#fee2e2; color:#b91c1c; }
    .alert.success { background:#dcfce7; color:#14532d; }
    .actions { display:flex; gap:12px; justify-content:flex-end; flex-wrap:wrap; }
    .btn { border:0; padding:10px 18px; border-radius:999px; cursor:pointer; font-weight:600; }
    .btn.primary { background:#0ea5e9; color:#fff; }
    .btn.secondary { background:#e2e8f0; color:#1f2937; }
    .btn.sm { padding:8px 12px; font-size:13px; }
    .btn:disabled { opacity:0.7; cursor:not-allowed; }
    .loading { padding:24px; text-align:center; font-size:15px; color:#475569; }
    .image-section { display:flex; flex-direction:column; gap:12px; margin-bottom:12px; }
    .image-section .preview { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .image-section img { width:160px; height:160px; object-fit:cover; border-radius:12px; border:1px solid #cbd5f5; background:#f1f5f9; }
    .image-section .no-img { width:160px; height:160px; display:flex; align-items:center; justify-content:center; border:1px dashed #cbd5f5; border-radius:12px; color:#94a3b8; font-size:13px; background:#f8fafc; }
    .file-input { display:inline-flex; flex-direction:column; gap:6px; font-weight:600; color:#0c4a6e; cursor:pointer; width:fit-content; }
    .file-input input { background:#f8fafc; border:1px dashed #93c5fd; border-radius:10px; padding:10px 12px; color:#0f172a; cursor:pointer; }
    .file-input input:disabled { cursor:not-allowed; opacity:0.6; }
    @media (max-width: 600px) {
      form { padding:16px; }
      .form-grid, .price-grid { grid-template-columns:1fr; }
      .image-section img,
      .image-section .no-img { width:100%; height:auto; aspect-ratio: 4 / 3; }
    }
    `
  ]
})
export class AdminCatalogoPrecioDetallePage {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private api = 'http://localhost:3000';

  id = Number(this.route.snapshot.paramMap.get('id'));
  cargando = signal(true);
  guardando = signal(false);
  error = signal('');
  exito = signal('');
  imagePreview: SafeUrl | null = null;
  private imageRaw: string | null = null;
  private imageDirty = false;

  form = this.fb.group({
    code: [{ value: '', disabled: true }],
    name: [{ value: '', disabled: true }],
    itemType: [{ value: '', disabled: true }],
    color: [{ value: '', disabled: true }],
    provider: [{ value: '', disabled: true }],
    quantity: [{ value: 0, disabled: true }],
    umbralBajoStock: [{ value: 0, disabled: true }],
    priceWeb: [0, [Validators.min(0)]],
    priceStore: [0, [Validators.min(0)]],
    priceWsp: [0, [Validators.min(0)]],
    qrRaw: [{ value: '', disabled: true }]
  });

  ngOnInit() {
    if (!Number.isFinite(this.id) || this.id <= 0) {
      this.cargando.set(false);
      this.error.set('Identificador de producto inválido.');
      return;
    }
    const stateItem = (this.router.getCurrentNavigation()?.extras.state?.['item'] ??
      history.state?.['item']) as InventoryItemDetail | undefined;
    if (stateItem && stateItem.id === this.id) {
      this.applyItem(stateItem);
      this.cargando.set(false);
      this.fetchItem({ silent: true });
    } else {
      this.fetchItem();
    }
  }

  private fetchItem(options: { silent?: boolean } = {}) {
    const silent = options.silent ?? false;
    if (!silent) {
      this.cargando.set(true);
      this.error.set('');
    }
    this.http.get<InventoryItemDetail>(`${this.api}/admin/inventory/${this.id}`).subscribe({
      next: item => {
        this.applyItem(item);
        if (!silent) this.cargando.set(false);
      },
      error: () => {
        if (!silent) {
          this.error.set('No se pudo cargar la informacion del producto.');
          this.cargando.set(false);
        }
      }
    });
  }

  private applyItem(item: InventoryItemDetail) {
    this.form.patchValue({
      code: item.code,
      name: item.name,
      itemType: item.itemType,
      color: item.color,
      provider: item.provider,
      quantity: item.quantity,
      umbralBajoStock: item.umbralBajoStock,
      priceWeb: item.priceWeb,
      priceStore: item.priceStore,
      priceWsp: item.priceWsp,
      qrRaw: item.qrRaw || ''
    });
    this.imageRaw = item.imageUrl || null;
    this.imagePreview = item.imageUrl ? this.sanitizer.bypassSecurityTrustUrl(item.imageUrl) : null;
    this.imageDirty = false;
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    this.exito.set('');
    const value = this.form.getRawValue();
    const toNumber = (v: unknown) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const payload: any = {
      priceWeb: toNumber(value.priceWeb),
      priceStore: toNumber(value.priceStore),
      priceWsp: toNumber(value.priceWsp)
    };
    if (this.imageDirty) {
      payload.imageUrl = this.imageRaw || null;
    }

    this.http.patch(`${this.api}/admin/inventory/${this.id}`, payload).subscribe({
      next: () => {
        this.guardando.set(false);
        this.exito.set('Producto actualizado correctamente.');
        this.fetchItem({ silent: true });
      },
      error: () => {
        this.guardando.set(false);
        this.error.set('No se pudo guardar el producto.');
      }
    });
  }

  onImageFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Selecciona un archivo de imagen valido.');
      this.exito.set('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.imageRaw = result;
      this.imagePreview = this.sanitizer.bypassSecurityTrustUrl(result);
      this.imageDirty = true;
      this.error.set('');
      this.exito.set('');
    };
    reader.onerror = () => {
      this.error.set('No se pudo leer la imagen seleccionada.');
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  clearImage() {
    this.imageRaw = null;
    this.imagePreview = null;
    this.imageDirty = true;
    this.error.set('');
    this.exito.set('');
  }

  volver() {
    this.router.navigate(['/admin/catalogo']);
  }
}
