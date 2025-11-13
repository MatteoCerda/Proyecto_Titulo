import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  PedidosService,
  OperatorClienteSearchResult,
  OperatorSalePayload,
  OperatorSaleResponse,
  OperatorSaleResumenItem
} from '../../services/pedidos.service';
import { firstValueFrom } from 'rxjs';
import { CatalogService, CatalogItem } from '../../services/catalog.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

type CanalVenta = 'presencial' | 'wsp';

@Component({
  standalone: true,
  selector: 'app-operator-venta-presencial',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './venta-presencial.page.html',
  styleUrls: ['./venta-presencial.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperatorVentaPresencialPage {
  private readonly fb = inject(FormBuilder);
  private readonly pedidos = inject(PedidosService);
  private readonly catalog = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly lookupRut = this.fb.control<string>('');
  readonly form = this.fb.group({
    canal: this.fb.control<CanalVenta>('presencial', { validators: [Validators.required] }),
    cliente: this.fb.group({
      rut: this.fb.control<string | null>(null),
      nombre: this.fb.control<string | null>(null),
      email: this.fb.control<string | null>(null, { validators: [Validators.email] }),
      telefono: this.fb.control<string | null>(null)
    }),
    resumen: this.fb.group({
      materialId: this.fb.control<string | null>(null),
      materialLabel: this.fb.control<string | null>(null),
      total: this.fb.control<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
      itemsCount: this.fb.control<number | null>(null),
      note: this.fb.control<string | null>(null),
      dtfMetros: this.fb.control<number | null>(null),
      dtfCentimetros: this.fb.control<number | null>(null),
      dtfCategoria: this.fb.control<'dtf' | 'textil' | 'uv' | 'tela' | 'pvc' | 'sticker' | 'comprinter'>('dtf'),
      comprinterMaterial: this.fb.control<'pvc' | 'pu'>('pvc'),
      adjuntoRequerido: this.fb.control<boolean>(false)
    }),
    agenda: this.fb.group({
      fecha: this.fb.control<string | null>(null),
      hora: this.fb.control<string | null>(null),
      tecnica: this.fb.control<string | null>(null),
      maquina: this.fb.control<string | null>(null),
      notas: this.fb.control<string | null>(null)
    })
  });

  readonly loading = signal(false);
  readonly searchLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchError = signal<string | null>(null);
  readonly clienteEncontrado = signal<OperatorClienteSearchResult | null>(null);
  readonly ventaRegistrada = signal<OperatorSaleResponse | null>(null);
  readonly attachments = signal<File[]>([]);
  readonly attachmentError = signal<string | null>(null);
  readonly selectedItems = signal<Array<{ item: CatalogItem; quantity: number }>>([]);
  readonly inventorySearch = signal<string>('');
  readonly maxAttachments = 10;

  readonly claimCode = computed(() => this.ventaRegistrada()?.claimCode || null);
  readonly requiereCodigo = computed(() => this.clienteEncontrado()?.cliente?.estado === 'pending_claim');
  readonly catalogItems = this.catalog.items;
  readonly catalogLoading = this.catalog.loading;
  readonly catalogError = this.catalog.error;

  constructor() {
    this.form.controls.canal.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncSelectionSummary(true);
      });

    void this.catalog.loadCatalog();
  }

  async buscarRut(): Promise<void> {
    const rut = (this.lookupRut.value || '').trim();
    this.searchError.set(null);
    this.ventaRegistrada.set(null);
    if (!rut) {
      this.searchError.set('Ingresa un RUT para buscar.');
      return;
    }
    const normalized = this.normalizeRutForSearch(rut);
    if (normalized === false) {
      this.searchError.set('El RUT ingresado no es válido. Revisa el dígito verificador.');
      return;
    }
    if (normalized === null) {
      this.prepareManualCliente(rut);
      return;
    }
    this.searchLoading.set(true);
    try {
      const result = await firstValueFrom(this.pedidos.searchClienteByRut(normalized.compact));
      this.clienteEncontrado.set(result);
      if (result.found && result.cliente) {
        this.form.patchValue(
          {
            cliente: {
              rut: result.cliente.rut,
              nombre: result.cliente.nombre,
              email: result.cliente.email,
              telefono: result.cliente.telefono
            }
          },
          { emitEvent: false }
        );
      } else {
        this.form.patchValue(
          {
            cliente: {
              rut: normalized.formatted,
              nombre: null,
              email: null,
              telefono: null
            }
          },
          { emitEvent: false }
        );
      }
    } catch (error) {
      console.error('Error buscando cliente', error);
      this.searchError.set('No pudimos buscar el RUT. Intenta nuevamente.');
    } finally {
      this.searchLoading.set(false);
    }
  }

  onAttachmentsSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) {
      return;
    }
    const current = this.attachments();
    const availableSlots = Math.max(0, this.maxAttachments - current.length);
    const accepted = availableSlots > 0 ? files.slice(0, availableSlots) : [];
    if (accepted.length) {
      this.attachments.set([...current, ...accepted]);
      this.attachmentError.set(null);
    }
    if (files.length > accepted.length) {
      this.attachmentError.set(
        `Puedes adjuntar hasta ${this.maxAttachments} archivos. Quita alguno para agregar nuevos.`
      );
    }
    if (input) {
      input.value = '';
    }
  }

  quitarAdjunto(index: number): void {
    this.attachments.update(list => list.filter((_, i) => i !== index));
    if (this.attachments().length < this.maxAttachments) {
      this.attachmentError.set(null);
    }
  }

  private prepareManualCliente(documento: string): void {
    this.clienteEncontrado.set({
      found: false,
      cliente: {
        id: 0,
        rut: documento,
        estado: 'nuevo',
        nombre: null,
        email: null,
        telefono: null,
        hasAccount: false
      }
    });
    this.form.patchValue(
      {
        cliente: {
          rut: documento,
          nombre: null,
          email: null,
          telefono: null
        }
      },
      { emitEvent: false }
    );
  }

  limpiar(): void {
    this.lookupRut.setValue('');
    this.form.reset({
      canal: 'presencial',
      cliente: {
        rut: null,
        nombre: null,
        email: null,
        telefono: null
      },
      resumen: {
        materialId: null,
        materialLabel: null,
        total: null,
        itemsCount: null,
        note: null,
        dtfMetros: null,
        dtfCentimetros: null,
        dtfCategoria: 'dtf',
        comprinterMaterial: 'pvc',
        adjuntoRequerido: false
      },
      agenda: {
        fecha: null,
        hora: null,
        tecnica: null,
        maquina: null,
        notas: null
      }
    });
    this.attachments.set([]);
    this.attachmentError.set(null);
    this.clienteEncontrado.set(null);
    this.ventaRegistrada.set(null);
    this.error.set(null);
    this.searchError.set(null);
    this.selectedItems.set([]);
    this.syncSelectionSummary(true);
  }

  async registrar(): Promise<void> {
    this.error.set(null);
    this.ventaRegistrada.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Completa los datos obligatorios antes de registrar la venta.');
      return;
    }
    const raw = this.form.getRawValue();
    const canal = (raw.canal as CanalVenta) || 'presencial';
    const total = Number(raw.resumen?.total ?? 0);
    if (Number.isNaN(total) || total < 0) {
      this.error.set('Debes indicar un monto válido para la venta.');
      return;
    }
    if (raw.resumen?.adjuntoRequerido && this.attachments().length === 0) {
      this.error.set('Marca adjunto solo cuando subas al menos un archivo.');
      return;
    }
    const resumenItems = this.buildResumenItems(canal);
    const payload: OperatorSalePayload = {
      canal,
      cliente: {
        rut: raw.cliente?.rut || undefined,
        nombre: raw.cliente?.nombre || undefined,
        email: raw.cliente?.email || undefined,
        telefono: raw.cliente?.telefono || undefined
      },
      resumen: {
        materialId: raw.resumen?.materialId || undefined,
        materialLabel: raw.resumen?.materialLabel || undefined,
        total,
        itemsCount: raw.resumen?.itemsCount ?? undefined,
        note: raw.resumen?.note || undefined,
        dtfMetros: this.parseNumber(raw.resumen?.dtfMetros),
        dtfCentimetros: this.parseNumber(raw.resumen?.dtfCentimetros),
        dtfCategoria: raw.resumen?.dtfCategoria || 'dtf',
        comprinterMaterial: raw.resumen?.comprinterMaterial || undefined,
        adjuntoRequerido: !!raw.resumen?.adjuntoRequerido,
        items: resumenItems.length ? resumenItems : undefined
      },
      agenda: raw.agenda?.fecha
        ? {
            fecha: raw.agenda.fecha,
            hora: raw.agenda.hora || undefined,
            tecnica: raw.agenda.tecnica || undefined,
            maquina: raw.agenda.maquina || undefined,
            notas: raw.agenda.notas || undefined
          }
        : undefined
    };

    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.pedidos.createOperatorSale(payload));
      this.ventaRegistrada.set(response);
      if (this.attachments().length) {
        try {
          await firstValueFrom(this.pedidos.uploadAttachments(response.id, this.attachments()));
        } catch (error) {
          console.error('Error subiendo adjuntos de venta presencial', error);
          this.error.set('La venta se registró, pero no pudimos subir los archivos. Puedes intentarlo desde el detalle del pedido.');
        }
      }
      this.attachments.set([]);
    } catch (error: any) {
      console.error('Error registrando venta presencial', error);
      const message = error?.error?.message || 'No pudimos registrar la venta. Intenta nuevamente.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  private parseNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }

  private normalizeRutForSearch(raw: string): { compact: string; formatted: string } | null | false {
    const cleaned = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    if (!/^\d{2,8}[0-9K]$/.test(cleaned)) {
      return null;
    }
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    if (!this.isValidRut(body, dv)) {
      return false;
    }
    const compact = `${body}${dv}`;
    return { compact, formatted: this.formatRut(compact) };
  }

  private formatRut(compact: string): string {
    const body = compact.slice(0, -1);
    const dv = compact.slice(-1);
    const reversed = body.split('').reverse();
    const groups: string[] = [];
    for (let i = 0; i < reversed.length; i += 3) {
      groups.push(reversed.slice(i, i + 3).reverse().join(''));
    }
    const formattedBody = groups.reverse().join('.');
    return `${formattedBody}-${dv}`;
  }

  private isValidRut(body: string, dv: string): boolean {
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const expected = 11 - (sum % 11);
    let dvCalc: string;
    if (expected === 11) dvCalc = '0';
    else if (expected === 10) dvCalc = 'K';
    else dvCalc = expected.toString();
    return dvCalc === dv.toUpperCase();
  }

  async buscarInventario(term: string): Promise<void> {
    const query = (term || '').trim();
    this.inventorySearch.set(query);
    await this.catalog.loadCatalog(query ? { search: query } : {});
  }

  async limpiarInventario(input?: HTMLInputElement): Promise<void> {
    this.inventorySearch.set('');
    if (input) {
      input.value = '';
    }
    await this.catalog.loadCatalog({}, true);
  }

  seleccionarItem(item: CatalogItem): void {
    this.selectedItems.update(entries => {
      const existing = entries.find(entry => entry.item.id === item.id);
      if (existing) {
        return entries.map(entry =>
          entry.item.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      }
      return [...entries, { item, quantity: 1 }];
    });
    this.syncSelectionSummary(true);
  }

  quitarItem(itemId: number): void {
    this.selectedItems.update(entries => entries.filter(entry => entry.item.id !== itemId));
    this.syncSelectionSummary(true);
  }

  ajustarCantidad(itemId: number, delta: number): void {
    this.selectedItems.update(entries =>
      entries
        .map(entry =>
          entry.item.id === itemId
            ? { ...entry, quantity: Math.max(1, entry.quantity + delta) }
            : entry
        )
        .filter(entry => entry.quantity > 0)
    );
    this.syncSelectionSummary(true);
  }

  fijarCantidad(itemId: number, value: number): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this.selectedItems.update(entries =>
      entries
        .map(entry =>
          entry.item.id === itemId
            ? { ...entry, quantity: Math.max(1, Math.floor(parsed)) }
            : entry
        )
        .filter(entry => entry.quantity > 0)
    );
    this.syncSelectionSummary(true);
  }

  estaSeleccionado(item: CatalogItem): boolean {
    return this.selectedItems().some(entry => entry.item.id === item.id);
  }

  cantidadSeleccionada(itemId: number): number {
    return this.selectedItems().find(entry => entry.item.id === itemId)?.quantity ?? 0;
  }

  trackBySelectedItem = (_: number, entry: { item: CatalogItem; quantity: number }): number => entry.item.id;

  private buildResumenItems(canal: CanalVenta): OperatorSaleResumenItem[] {
    return this.selectedItems().map(entry => ({
      itemId: entry.item.id,
      name: entry.item.name,
      quantity: entry.quantity,
      itemType: entry.item.itemType,
      provider: entry.item.provider,
      pricePresencial: this.getPriceForItem(entry.item, 'presencial'),
      priceWsp: this.getPriceForItem(entry.item, 'wsp'),
      selectedUnitPrice: this.getPriceForItem(entry.item, canal)
    }));
  }

  private syncSelectionSummary(updateTotal: boolean): void {
    const items = this.selectedItems();
    const resumenGroup = this.form.get('resumen');
    if (!resumenGroup) return;

    if (!items.length) {
      const resetPatch: Record<string, unknown> = {
        materialId: null,
        materialLabel: null,
        itemsCount: null
      };
      if (updateTotal) {
        resetPatch['total'] = null;
      }
      (resumenGroup as any).patchValue(resetPatch, { emitEvent: false });
      return;
    }

    const canal = (this.form.get('canal')?.value as CanalVenta) || 'presencial';
    const itemsCount = items.reduce((acc, entry) => acc + entry.quantity, 0);
    const label =
      items.length === 1
        ? items[0].item.name
        : items.map(entry => entry.item.name).join(', ');
    const materialId = items.length === 1 ? String(items[0].item.id) : 'multiple';

    const patch: Record<string, unknown> = {
      materialId,
      materialLabel: label,
      itemsCount
    };

    if (updateTotal) {
      const suggested = this.calculateSuggestedTotal(canal);
      if (suggested !== null) {
        patch['total'] = suggested;
      }
    }

    (resumenGroup as any).patchValue(patch, { emitEvent: false });
  }

  private calculateSuggestedTotal(canal: CanalVenta): number | null {
    const items = this.selectedItems();
    if (!items.length) {
      return null;
    }
    let total = 0;
    for (const entry of items) {
      const price = this.getPriceForItem(entry.item, canal);
      if (price === null) {
        return null;
      }
      total += price * entry.quantity;
    }
    return Math.round(total);
  }

  private getPriceForItem(item: CatalogItem, canal: CanalVenta): number | null {
    if (canal === 'presencial') {
      return item.priceStore ?? item.price ?? item.priceWeb ?? item.priceWsp ?? null;
    }
    return item.priceWsp ?? item.price ?? item.priceWeb ?? item.priceStore ?? null;
  }

  precioPresencial(item: CatalogItem): number {
    return this.getPriceForItem(item, 'presencial') ?? 0;
  }

  precioWsp(item: CatalogItem): number {
    return this.getPriceForItem(item, 'wsp') ?? 0;
  }
}

