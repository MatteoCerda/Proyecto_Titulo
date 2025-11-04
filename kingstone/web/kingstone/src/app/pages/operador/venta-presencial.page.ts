import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PedidosService, OperatorClienteSearchResult, OperatorSalePayload, OperatorSaleResponse } from '../../services/pedidos.service';
import { firstValueFrom } from 'rxjs';

type CanalVenta = 'presencial' | 'wsp';

@Component({
  standalone: true,
  selector: 'app-operator-venta-presencial',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './venta-presencial.page.html',
  styleUrls: ['./venta-presencial.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperatorVentaPresencialPage {
  private readonly fb = inject(FormBuilder);
  private readonly pedidos = inject(PedidosService);

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

  readonly claimCode = computed(() => this.ventaRegistrada()?.claimCode || null);
  readonly requiereCodigo = computed(() => this.clienteEncontrado()?.cliente?.estado === 'pending_claim');

  async buscarRut(): Promise<void> {
    const rut = (this.lookupRut.value || '').trim();
    this.searchError.set(null);
    this.ventaRegistrada.set(null);
    if (!rut) {
      this.searchError.set('Ingresa un RUT para buscar.');
      return;
    }
    const normalized = this.normalizeRutForSearch(rut);
    if (!normalized) {
      this.searchError.set('El RUT ingresado no es válido.');
      return;
    }
    this.searchLoading.set(true);
    try {
      const result = await firstValueFrom(this.pedidos.searchClienteByRut(normalized));
      this.clienteEncontrado.set(result);
      if (result.found && result.cliente) {
        this.form.patchValue({
          cliente: {
            rut: result.cliente.rut,
            nombre: result.cliente.nombre,
            email: result.cliente.email,
            telefono: result.cliente.telefono
          }
        });
      } else {
        this.form.patchValue({
          cliente: {
            rut: this.formatRut(normalized),
            nombre: null,
            email: null,
            telefono: null
          }
        });
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
    this.attachments.set(files);
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
    this.clienteEncontrado.set(null);
    this.ventaRegistrada.set(null);
    this.error.set(null);
    this.searchError.set(null);
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
    const total = Number(raw.resumen?.total ?? 0);
    if (Number.isNaN(total) || total < 0) {
      this.error.set('Debes indicar un monto válido para la venta.');
      return;
    }
    const payload: OperatorSalePayload = {
      canal: raw.canal || 'presencial',
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
        adjuntoRequerido: !!raw.resumen?.adjuntoRequerido
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

  private normalizeRutForSearch(raw: string): string | null {
    const cleaned = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    if (!/^\d{2,8}[0-9K]$/.test(cleaned)) {
      return null;
    }
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    return `${body}${dv}`;
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
}
