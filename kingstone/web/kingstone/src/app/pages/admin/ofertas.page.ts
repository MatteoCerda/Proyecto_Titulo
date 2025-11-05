import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

interface Oferta {
  id: number;
  titulo: string;
  descripcion?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  activo: boolean;
  prioridad: number;
  itemId?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  precioOferta?: number | null;
  inventario?: { id: number; code: string; name: string } | null;
}

interface OfertaForm {
  titulo: string;
  descripcion: string;
  imageUrl: string;
  link: string;
  activo: boolean;
  prioridad: number;
  itemId: string;
  startAt: string;
  endAt: string;
  precioOferta: string;
}

interface InventoryOption { id: number; code: string; name: string; }

@Component({
  standalone: true,
  selector: 'app-admin-ofertas',
  imports: [CommonModule, FormsModule, IonContent, IonSpinner, IonIcon],
  templateUrl: './ofertas.page.html',
  styleUrls: ['./ofertas.page.scss']
})
export class AdminOfertasPage {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly apiBase = (environment.apiUrl || '').replace(/\/$/, '');

  private endpoint(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (this.apiBase) {
      return `${this.apiBase}${normalized}`;
    }
    if (normalized.startsWith('/api/')) {
      return normalized;
    }
    return `/api${normalized}`;
  }

  offers = signal<Oferta[]>([]);
  inventory = signal<InventoryOption[]>([]);
  loading = false;
  saving = false;
  error = signal<string | null>(null);

  editingId: number | null = null;
  form: OfertaForm = this.emptyForm();
  formError = '';

  ngOnInit() {
    this.loadInventory();
    this.load();
  }

  private emptyForm(): OfertaForm {
    return {
      titulo: '',
      descripcion: '',
      imageUrl: '',
      link: '',
      activo: true,
      prioridad: 0,
      itemId: '',
      startAt: '',
      endAt: '',
      precioOferta: ''
    };
  }

  load() {
    this.loading = true;
    this.http.get<Oferta[]>(this.endpoint('/admin/offers'), { params: { all: '1' } }).subscribe({
      next: offers => {
        this.loading = false;
        this.offers.set(offers);
        this.error.set(null);
      },
      error: err => {
        this.loading = false;
        this.offers.set([]);
        this.error.set(err?.error?.message || 'No se pudieron cargar las ofertas');
      }
    });
  }

  loadInventory() {
    this.http.get<any[]>(this.endpoint('/admin/inventory')).subscribe({
      next: items => {
        const options = (items || []).map((item: any) => ({ id: item.id, code: item.code, name: item.name }));
        this.inventory.set(options);
      },
      error: () => this.inventory.set([])
    });
  }

  previewUrl(): SafeUrl | null {
    if (!this.form.imageUrl) return null;
    return this.sanitizer.bypassSecurityTrustUrl(this.form.imageUrl);
  }

  offerPreview(oferta: Oferta): SafeUrl | null {
    if (!oferta.imageUrl) return null;
    return this.sanitizer.bypassSecurityTrustUrl(oferta.imageUrl);
  }

  edit(oferta: Oferta) {
    this.editingId = oferta.id;
    this.form = {
      titulo: oferta.titulo,
      descripcion: oferta.descripcion ?? '',
      imageUrl: oferta.imageUrl ?? '',
      link: oferta.link ?? '',
      activo: oferta.activo,
      prioridad: oferta.prioridad,
      itemId: oferta.itemId ? String(oferta.itemId) : '',
      startAt: oferta.startAt ? this.toLocalDateTime(oferta.startAt) : '',
      endAt: oferta.endAt ? this.toLocalDateTime(oferta.endAt) : '',
      precioOferta:
        oferta.precioOferta !== undefined && oferta.precioOferta !== null
          ? String(oferta.precioOferta)
          : ''
    };
    this.formError = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  reset() {
    this.editingId = null;
    this.form = this.emptyForm();
    this.formError = '';
  }

  save() {
    if (this.saving) return;
    const titulo = this.form.titulo.trim();
    if (!titulo) {
      this.formError = 'El titulo es obligatorio.';
      return;
    }
    if (this.form.link && !this.isValidUrl(this.form.link)) {
      this.formError = 'El enlace debe ser una URL valida.';
      return;
    }
    if (this.form.imageUrl && !this.isValidUrl(this.form.imageUrl)) {
      this.formError = 'La URL de la imagen debe ser valida.';
      return;
    }

    const startAt = this.form.startAt ? new Date(this.form.startAt) : null;
    const endAt = this.form.endAt ? new Date(this.form.endAt) : null;
    if (startAt && endAt && startAt > endAt) {
      this.formError = 'La fecha de inicio debe ser anterior a la fecha de termino.';
      return;
    }

    const payload: any = {
      titulo,
      descripcion: this.form.descripcion.trim() || null,
      imageUrl: this.form.imageUrl.trim() || undefined,
      link: this.form.link.trim() || undefined,
      activo: this.form.activo,
      prioridad: this.form.prioridad ?? 0,
      itemId: this.form.itemId ? Number(this.form.itemId) : undefined,
      startAt: startAt ? startAt.toISOString() : undefined,
      endAt: endAt ? endAt.toISOString() : undefined
    };

    const precioRaw = (this.form.precioOferta || '').trim();
    if (precioRaw.length) {
      const parsed = Number(precioRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        this.formError = 'El precio de oferta debe ser un número mayor o igual a 0.';
        return;
      }
      payload.precioOferta = Math.round(parsed);
    }

    this.saving = true;
    this.formError = '';

    const request = this.editingId
      ? this.http.patch<Oferta>(this.endpoint(`/admin/offers/${this.editingId}`), payload)
      : this.http.post<Oferta>(this.endpoint('/admin/offers'), payload);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.reset();
        this.load();
      },
      error: err => {
        this.saving = false;
        const issues = err?.error?.issues;
        if (Array.isArray(issues) && issues.length) {
          this.formError = issues[0]?.message || 'Datos invalidos.';
          return;
        }
        this.formError = err?.error?.message || 'No se pudo guardar la oferta.';
      }
    });
  }

  toggle(oferta: Oferta) {
    this.http.patch<Oferta>(this.endpoint(`/admin/offers/${oferta.id}`), { activo: !oferta.activo }).subscribe({
      next: updated => {
        this.offers.set(this.offers().map(o => (o.id === updated.id ? updated : o)));
      },
      error: () => alert('No se pudo actualizar el estado de la oferta.')
    });
  }

  remove(oferta: Oferta) {
    if (!confirm(`Eliminar la oferta "${oferta.titulo}"?`)) return;
    this.http.delete(this.endpoint(`/admin/offers/${oferta.id}`)).subscribe({
      next: () => {
        this.offers.set(this.offers().filter(o => o.id !== oferta.id));
        if (this.editingId === oferta.id) {
          this.reset();
        }
      },
      error: () => alert('No se pudo eliminar la oferta.')
    });
  }

  private isValidUrl(value: string) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  private toLocalDateTime(value: string) {
    const date = new Date(value);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

