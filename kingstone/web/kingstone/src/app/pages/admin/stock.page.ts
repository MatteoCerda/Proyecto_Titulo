import { Component, signal, inject, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import jsQR from 'jsqr';

interface InventoryItem {
  id: number;
  code: string;
  name: string;
  itemType: string;
  color: string;
  provider: string;
  quantity: number;
  umbralBajoStock: number;
  qrRaw?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-stock',
  imports: [CommonModule, FormsModule, IonContent, IonSpinner],
  template: `
  <ion-content class="stock-wrap">
    <div class="panel">
      <section class="form-card">
        <h2>Agregar item de inventario</h2>
        <p class="help">
          Pega el texto leido desde el QR o completa los datos manualmente. Se calculara el nombre, tipo, color y proveedor automaticamente si el codigo sigue el formato
          <code>PRODUCTO_TIPO_COLOR_PROVEEDOR</code>.
        </p>

        <label>
          Texto QR (opcional)
          <textarea rows="4" [(ngModel)]="form.qrRaw" name="qrRaw" (ngModelChange)="onQrChange($event)"></textarea>
        </label>
        <label class="qr-file">
          Leer desde archivo QR
          <input type="file" accept="image/*" (change)="onQrFile($event)">
        </label>
        <div class="camera-actions">
          <button class="btn secondary" type="button" (click)="toggleScan()" [disabled]="saving">
            {{ isScanning() ? 'Detener camara' : 'Escanear con camara' }}
          </button>
          <span class="scan-error" *ngIf="scanError()">{{ scanError() }}</span>
        </div>
        <div class="camera-preview" *ngIf="isScanning()">
          <video #qrVideo autoplay muted playsinline></video>
        </div>

        <div class="image-upload">
          <label>
            Imagen del vinilo (opcional)
            <input type="file" accept="image/*" (change)="onImageFile($event)" [disabled]="saving">
          </label>
          <div class="image-preview-block" *ngIf="imagePreview">
            <img [src]="imagePreview" alt="Vista previa del vinilo">
            <button class="btn secondary sm" type="button" (click)="clearImage()" [disabled]="saving">Quitar</button>
          </div>
        </div>

        <div class="grid">
          <label>
            Codigo
            <input type="text" [(ngModel)]="form.code" name="code" required>
          </label>
          <label>
            Nombre
            <input type="text" [(ngModel)]="form.name" name="name" required>
          </label>
        </div>
        <div class="grid">
          <label>
            Tipo
            <input type="text" [(ngModel)]="form.itemType" name="itemType" required>
          </label>
          <label>
            Color
            <input type="text" [(ngModel)]="form.color" name="color" required>
          </label>
        </div>
        <div class="grid">
          <label>
            Proveedor
            <input type="text" [(ngModel)]="form.provider" name="provider" required>
          </label>
          <label>
            Cantidad
            <input type="number" min="0" [(ngModel)]="form.quantity" name="quantity">
          </label>
        </div>
        <div class="grid">
          <label>
            Umbral bajo stock (aviso)
            <input type="number" min="0" [(ngModel)]="form.umbralBajoStock" name="umbralBajoStock">
          </label>
        </div>

        <div class="error" *ngIf="formError">{{ formError }}</div>

        <div class="actions">
          <button class="btn primary" (click)="submit()" [disabled]="saving">
            {{ saving ? 'Guardando...' : 'Guardar' }}
          </button>
          <button class="btn secondary" type="button" (click)="resetForm()" [disabled]="saving">Limpiar</button>
        </div>
      </section>

      <section class="list-card">
        <header>
          <h2>Inventario</h2>
          <div class="list-actions">
            <button class="btn secondary sm" type="button" (click)="load()" [disabled]="loading">
              <ion-spinner *ngIf="loading" name="dots"></ion-spinner>
              <span *ngIf="!loading">Refrescar</span>
            </button>
          </div>
        </header>

        <div class="empty" *ngIf="!loading && items().length === 0">
          No hay productos registrados.
        </div>

        <div class="table" *ngIf="items().length > 0">
          <table class="stock-table">
            <thead>
              <tr>
                <th class="col-img">Imagen</th>
                <th class="col-code">Código</th>
                <th class="col-name">Nombre</th>
                <th class="col-meta">Tipo</th>
                <th class="col-meta">Color</th>
                <th class="col-meta">Proveedor</th>
                <th class="col-qty">Cantidad</th>
                <th class="col-qty">Umbral</th>
                <th class="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of items()">
                <td class="col-img">
                  <ng-container *ngIf="imageSrc(item) as img; else noImg">
                    <img [src]="img" alt="Imagen de {{item.name}}">
                  </ng-container>
                  <ng-template #noImg>
                    <div class="img-placeholder">Sin imagen</div>
                  </ng-template>
                </td>
                <td class="col-code">
                  <div class="code">{{ item.code }}</div>
                </td>
                <td class="col-name">
                  <div class="name">{{ item.name }}</div>
                  <div class="meta">{{ item.qrRaw }}</div>
                </td>
                <td class="col-meta">{{ item.itemType }}</td>
                <td class="col-meta">{{ item.color }}</td>
                <td class="col-meta">{{ item.provider }}</td>
                <td class="col-qty">
                  <input type="number" min="0" [(ngModel)]="item.quantity" (blur)="updateQuantity(item)">
                </td>
                <td class="col-qty">
                  <input type="number" min="0" [(ngModel)]="item.umbralBajoStock" (blur)="updateThreshold(item)">
                </td>
                <td class="col-actions">
                  <button class="btn danger sm" type="button" (click)="remove(item)">Eliminar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </ion-content>
  `,
  styles: [
    `
    .stock-wrap { --padding-start:16px; --padding-end:16px; }
    .panel { display:flex; flex-direction:column; gap:24px; padding:12px 0 32px; }
    @media (min-width: 1100px) {
      .panel { flex-direction:row; align-items:flex-start; }
      .form-card { flex:0 0 420px; position:sticky; top:16px; }
      .list-card { flex:1; }
    }

    .form-card, .list-card {
      background:#062a3d;
      color:#e2e8f0;
      border-radius:12px;
      padding:20px;
      box-shadow:0 18px 25px rgba(15,23,42,0.25);
    }
    .form-card h2, .list-card h2 { margin:0 0 12px; font-size:20px; }
    .help { margin:0 0 16px; font-size:13px; color:#cbd5f5; }
    .help code { background:rgba(148,163,184,0.2); padding:2px 4px; border-radius:4px; }

    label { display:flex; flex-direction:column; gap:6px; font-size:14px; margin-bottom:12px; }
    .qr-file input { background:#0b3a54; border:1px dashed rgba(148,163,184,0.4); padding:10px; border-radius:8px; color:#e2e8f0; cursor:pointer; }
    .camera-actions { display:flex; align-items:center; gap:12px; margin-top:8px; flex-wrap:wrap; }
    .camera-preview { margin-top:12px; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden; background:#000; max-width:340px; }
    .camera-preview video { width:100%; height:auto; display:block; }
    .scan-error { color:#f87171; font-size:13px; }
    .image-upload { margin-top:12px; display:flex; flex-direction:column; gap:10px; }
    .image-upload input { background:#0b3a54; border:1px dashed rgba(148,163,184,0.4); padding:10px; border-radius:8px; color:#e2e8f0; cursor:pointer; }
    .image-preview-block { display:flex; align-items:center; gap:14px; }
    .image-preview-block img { width:96px; height:96px; object-fit:cover; border-radius:8px; border:1px solid rgba(148,163,184,0.3); background:#0f172a; }
    input, textarea, select {
      background:#0b3a54;
      border:1px solid rgba(148,163,184,0.35);
      border-radius:8px;
      padding:8px 10px;
      color:#e2e8f0;
      font-size:14px;
    }
    textarea { resize:vertical; }
    input:focus, textarea:focus {
      outline:2px solid rgba(56,189,248,0.35);
    }

    .grid { display:grid; gap:12px; }
    @media (min-width: 640px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

    .actions { display:flex; gap:10px; margin-top:12px; }
    .btn {
      background:#0c4a6e;
      color:#fff;
      border:0;
      padding:9px 16px;
      border-radius:999px;
      cursor:pointer;
      font-weight:600;
    }
    .btn.primary { background:#0c4a6e; }
    .btn.secondary { background:#475569; }
    .btn.danger { background:#b91c1c; }
    .btn.sm { padding:6px 12px; font-size:13px; }
    .btn:disabled { opacity:.6; cursor:not-allowed; }

    .list-card header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .list-actions { display:flex; gap:10px; align-items:center; }

    .empty { padding:24px; text-align:center; color:#cbd5f5; font-size:14px; }

    .table { border-radius:10px; overflow:hidden; border:1px solid rgba(148,163,184,0.2); }
    .stock-table { width:100%; border-collapse:separate; border-spacing:0; color:#e2e8f0; }
    .stock-table thead { background:rgba(15,23,42,0.45); font-size:12px; letter-spacing:0.04em; text-transform:uppercase; }
    .stock-table th,
    .stock-table td { padding:12px 16px; border-bottom:1px solid rgba(148,163,184,0.18); text-align:left; vertical-align:middle; }
    .stock-table tbody tr:last-child td { border-bottom:none; }
    .stock-table .col-img { width:90px; }
    .stock-table .col-img img {
      width:68px;
      height:68px;
      border-radius:10px;
      object-fit:cover;
      border:1px solid rgba(148,163,184,0.35);
      background:#0f172a;
      display:block;
    }
    .img-placeholder {
      width:68px;
      height:68px;
      border-radius:10px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:11px;
      text-align:center;
      background:rgba(15,23,42,0.5);
      color:#9ca3af;
      padding:6px;
    }
    .stock-table .col-code .code { font-weight:600; word-break:break-word; }
    .stock-table .col-name .name { font-weight:700; }
    .stock-table .col-name .meta { font-size:12px; color:#94a3b8; margin-top:4px; word-break:break-word; max-width:320px; }
    .stock-table .col-meta { white-space:nowrap; font-size:14px; }
    .stock-table .col-qty input {
      width:88px;
      padding:6px 8px;
      border-radius:8px;
      border:1px solid rgba(148,163,184,0.4);
      background:#0b3a54;
      color:#e2e8f0;
      text-align:right;
    }
    .stock-table .col-actions { text-align:right; }

    .error { color:#f87171; font-size:13px; margin-top:4px; }
    `
  ]
})
export class AdminStockPage implements OnDestroy {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  @ViewChild('qrVideo') qrVideo?: ElementRef<HTMLVideoElement>;

  items = signal<InventoryItem[]>([]);
  loading = false;
  saving = false;
  formError = '';
  scanError = signal('');
  isScanning = signal(false);
  form = {
    qrRaw: '',
    code: '',
    name: '',
    itemType: '',
    color: '',
    provider: '',
    quantity: 0,
    umbralBajoStock: 0,
    imageUrl: ''
  };
  imagePreview: string | null = null;

  private scanAnimation?: number;
  private stream?: MediaStream;

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.stopScan();
  }

  load() {
    this.loading = true;
    this.http.get<InventoryItem[]>(`http://localhost:3000/admin/inventory`).subscribe({
      next: items => {
        this.items.set(items);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onQrChange(value: string) {
    if (!value) {
      this.form = { ...this.form, code: '', name: '', itemType: '', color: '', provider: '' };
      return;
    }
    const parsed = this.parseQr(value);
    this.form = { ...this.form, ...parsed, qrRaw: value, quantity: this.form.quantity };
  }

  submit() {
    if (this.saving) return;
    if (this.form.qrRaw?.trim()) {
      const parsed = this.parseQr(this.form.qrRaw);
      this.form = { ...this.form, ...parsed, qrRaw: this.form.qrRaw };
    }
    const code = this.form.code.trim();
    const name = this.form.name.trim();
    const itemType = this.form.itemType.trim();
    const color = this.form.color.trim();
    const provider = this.form.provider.trim();
    const quantity = Number(this.form.quantity || 0);

    if (!code || !name || !itemType || !color || !provider) {
      this.formError = 'Todos los campos son obligatorios (cantidad puede ser cero).';
      return;
    }

    this.formError = '';
    this.saving = true;
    this.http.post<InventoryItem>(`http://localhost:3000/admin/inventory`, {
      qrRaw: this.form.qrRaw || undefined,
      code,
      name,
      itemType,
      color,
      provider,
      quantity,
      umbralBajoStock: this.form.umbralBajoStock || 0,
      imageUrl: this.form.imageUrl || undefined
    }).subscribe({
      next: item => {
        this.saving = false;
        const exists = this.items().some(i => i.id === item.id);
        if (exists) {
          this.items.set(this.items().map(i => (i.id === item.id ? item : i)));
        } else {
          this.items.set([item, ...this.items()]);
        }
        this.resetForm();
      },
      error: err => {
        this.saving = false;
        const issues = err?.error?.issues;
        if (Array.isArray(issues) && issues.length) {
          this.formError = issues[0]?.message || 'Datos invalidos.';
          return;
        }
        this.formError = err?.error?.message || 'No se pudo guardar el item.';
      }
    });
  }

  toggleScan() {
    if (this.isScanning()) {
      this.stopScan();
    } else {
      this.startScan();
    }
  }

  private async startScan() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.scanError.set('Este dispositivo no soporta escaneo por camara.');
      return;
    }
    this.scanError.set('');
    this.isScanning.set(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    const video = this.qrVideo?.nativeElement;
    if (!video) {
      this.scanError.set('No se pudo preparar la vista de camara.');
      this.isScanning.set(false);
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      video.srcObject = this.stream;
      await video.play();
      this.scanLoop();
    } catch (err) {
      console.error('startScan error', err);
      this.scanError.set('No se pudo acceder a la camara. Revisa permisos.');
      this.stopScan();
    }
  }

  private scanLoop = () => {
    if (!this.isScanning()) return;
    const video = this.qrVideo?.nativeElement;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this.scanAnimation = requestAnimationFrame(this.scanLoop);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.scanAnimation = requestAnimationFrame(this.scanLoop);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
    if (result?.data) {
      this.form.qrRaw = result.data;
      this.onQrChange(result.data);
      this.scanError.set('');
      this.stopScan();
      return;
    }
    this.scanAnimation = requestAnimationFrame(this.scanLoop);
  };

  private stopScan() {
    if (this.scanAnimation) {
      cancelAnimationFrame(this.scanAnimation);
      this.scanAnimation = undefined;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = undefined;
    }
    const video = this.qrVideo?.nativeElement;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    this.isScanning.set(false);
  }

  imageSrc(item: InventoryItem): SafeUrl | null {
    if (!item?.imageUrl) return null;
    return this.sanitizer.bypassSecurityTrustUrl(item.imageUrl);
  }

  onImageFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.formError = 'Selecciona un archivo de imagen valido.';
      return;
    }
    this.formError = '';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.form.imageUrl = result;
      this.imagePreview = result;
    };
    reader.onerror = () => {
      this.formError = 'No se pudo leer la imagen seleccionada.';
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  clearImage() {
    this.form.imageUrl = '';
    this.imagePreview = null;
  }

  onQrFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.formError = '';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          this.formError = 'No se pudo preparar el lector de QR.';
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
        if (!result?.data) {
          this.formError = 'No se pudo leer el codigo QR (asegura buena iluminacion y nitidez).';
          return;
        }
        this.form.qrRaw = result.data;
        this.onQrChange(result.data);
        this.scanError.set('');
        this.stopScan();
      };
      img.onerror = () => {
        this.formError = 'No se pudo procesar la imagen seleccionada.';
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      this.formError = 'No se pudo leer el archivo QR.';
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  resetForm() {
    this.form = {
      qrRaw: '',
      code: '',
      name: '',
      itemType: '',
      color: '',
      provider: '',
      quantity: 0,
      umbralBajoStock: 0,
      imageUrl: ''
    };
    this.formError = '';
    this.imagePreview = null;
  }

  updateQuantity(item: InventoryItem) {
    const quantity = Number(item.quantity);
    if (Number.isNaN(quantity) || quantity < 0) {
      item.quantity = 0;
    }
    this.http.patch<InventoryItem>(`http://localhost:3000/admin/inventory/${item.id}`, {
      quantity: item.quantity
    }).subscribe({
      next: updated => {
        this.items.set(this.items().map(i => (i.id === updated.id ? { ...i, ...updated } : i)));
      },
      error: () => {
        // revert on error
        this.load();
      }
    });
  }

  updateThreshold(item: InventoryItem) {
    const umbral = Number(item.umbralBajoStock);
    if (Number.isNaN(umbral) || umbral < 0) {
      item.umbralBajoStock = 0;
    }
    this.http.patch<InventoryItem>(`http://localhost:3000/admin/inventory/${item.id}`, {
      umbralBajoStock: item.umbralBajoStock
    }).subscribe({
      next: updated => {
        this.items.set(this.items().map(i => (i.id === updated.id ? { ...i, ...updated } : i)));
      },
      error: () => {
        this.load();
      }
    });
  }

  remove(item: InventoryItem) {
    if (!confirm(`Eliminar ${item.name}?`)) return;
    this.http.delete(`http://localhost:3000/admin/inventory/${item.id}`).subscribe({
      next: () => {
        this.items.set(this.items().filter(i => i.id !== item.id));
      },
      error: () => {
        // noop
      }
    });
  }

  private parseQr(qrRaw: string) {
    const result: Partial<typeof this.form> = {};
    const lines = qrRaw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey || !rest.length) continue;
      const key = this.normalizeKey(rawKey);
      const value = rest.join(':').trim();
      if (!value) continue;
      if (key.startsWith('codigo')) result.code = value;
      else if (key.startsWith('nombre')) result.name = value;
      else if (key.startsWith('tipo')) result.itemType = value;
      else if (key.startsWith('color')) result.color = value;
      else if (key.startsWith('proveedor')) result.provider = value;
    }
    if (result.code) {
      const parts = String(result.code).split('_');
      if (!result.name && parts.length > 0) result.name = parts[0];
      if (!result.itemType && parts.length > 1) result.itemType = parts[1];
      if (!result.color && parts.length > 2) result.color = parts[2];
      if (!result.provider && parts.length > 3) result.provider = parts[parts.length - 1];
    }
    return result;
  }

  private normalizeKey(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
}




