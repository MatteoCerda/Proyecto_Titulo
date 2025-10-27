import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { PedidosService, WorkOrderSummary } from '../../services/pedidos.service';

type CalendarWorkOrder = WorkOrderSummary & {
  pedido: {
    id: number;
    clienteNombre: string | null;
    clienteEmail: string | null;
    estado: string;
    materialLabel: string | null;
  };
};

type CalendarDay = {
  date: Date;
  key: string;
  label: string;
  items: CalendarWorkOrder[];
};

@Component({
  standalone: true,
  selector: 'app-operator-calendar',
  imports: [CommonModule, DatePipe, IonContent, IonButton],
  templateUrl: './calendario.page.html',
  styleUrls: ['./calendario.page.scss']
})
export class OperatorCalendarPage implements OnInit {
  private readonly pedidos = inject(PedidosService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly workOrders = signal<CalendarWorkOrder[]>([]);
  readonly updatingId = signal<number | null>(null);

  private readonly stageLabels: Record<string, string> = {
    cola: 'En cola',
    produccion: 'En produccion',
    control_calidad: 'Control de calidad',
    listo_retiro: 'Listo para retiro'
  };

  readonly stages = [
    { value: 'cola', label: 'En cola' },
    { value: 'produccion', label: 'En produccion' },
    { value: 'control_calidad', label: 'Control de calidad' },
    { value: 'listo_retiro', label: 'Listo para retiro' }
  ];

  readonly rangeStart = signal(this.startOfWeek(new Date()));
  readonly rangeEnd = computed(() => this.addDays(this.rangeStart(), 6));

  readonly days = computed<CalendarDay[]>(() => {
    const start = this.rangeStart();
    const grouped = new Map<string, CalendarWorkOrder[]>();
    for (const item of this.workOrders()) {
      const key = item.programadoPara
        ? this.toKey(new Date(item.programadoPara))
        : this.toKey(start);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    const result: CalendarDay[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = this.addDays(start, offset);
      const key = this.toKey(date);
      const items = (grouped.get(key) ?? []).sort((a, b) => {
        const left = a.programadoPara ? new Date(a.programadoPara).getTime() : 0;
        const right = b.programadoPara ? new Date(b.programadoPara).getTime() : 0;
        return left - right;
      });
      result.push({
        date,
        key,
        label: this.toLabel(date),
        items
      });
    }
    return result;
  });

  readonly rangeLabel = computed(() => {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = this.rangeStart().toISOString();
      const to = this.addDays(this.rangeStart(), 6).toISOString();
      const data = await firstValueFrom(this.pedidos.listWorkOrdersCalendar({ from, to }));
      this.workOrders.set(data);
    } catch (err) {
      console.error('Error cargando calendario de ordenes', err);
      this.error.set('No pudimos cargar la planificacion. Intenta nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  async previousWeek(): Promise<void> {
    const start = this.addDays(this.rangeStart(), -7);
    this.rangeStart.set(this.startOfWeek(start));
    await this.load();
  }

  async nextWeek(): Promise<void> {
    const start = this.addDays(this.rangeStart(), 7);
    this.rangeStart.set(this.startOfWeek(start));
    await this.load();
  }

  async resetToday(): Promise<void> {
    this.rangeStart.set(this.startOfWeek(new Date()));
    await this.load();
  }

  stageLabel(stage: string): string {
    return this.stageLabels[stage] || stage;
  }

  async updateStage(item: CalendarWorkOrder, stage: string): Promise<void> {
    if (!stage || stage === item.estado) {
      return;
    }
    await this.updateWorkOrder(item, { estado: stage });
  }

  async updateScheduleDate(item: CalendarWorkOrder, dateValue: string): Promise<void> {
    if (!dateValue) {
      await this.updateWorkOrder(item, { programadoPara: null });
      return;
    }
    const currentTime = this.toTimeValue(item.programadoPara) || '08:00';
    await this.updateWorkOrder(item, { programadoPara: this.combineDateTime(dateValue, currentTime) });
  }

  async updateScheduleTime(item: CalendarWorkOrder, timeValue: string): Promise<void> {
    if (!timeValue) {
      const dateValue = this.toDateValue(item.programadoPara);
      await this.updateWorkOrder(item, { programadoPara: dateValue ? this.combineDateTime(dateValue, '00:00') : null });
      return;
    }
    const dateValue = this.toDateValue(item.programadoPara) || this.toDateValue(this.rangeStart().toISOString());
    if (!dateValue) {
      return;
    }
    await this.updateWorkOrder(item, { programadoPara: this.combineDateTime(dateValue, timeValue) });
  }

  async updateNotes(item: CalendarWorkOrder, notes: string): Promise<void> {
    const trimmed = notes?.trim?.() ?? '';
    await this.updateWorkOrder(item, { notas: trimmed || null });
  }

  goToPedido(item: CalendarWorkOrder): void {
    this.router.navigate(['/operador/pagos'], {
      queryParams: { selected: item.pedidoId }
    });
  }

  private async updateWorkOrder(item: CalendarWorkOrder, payload: Record<string, any>): Promise<void> {
    try {
      this.updatingId.set(item.id);
      const updated = await firstValueFrom(this.pedidos.updateWorkOrder(item.id, payload));
      this.workOrders.update(list =>
        list.map(entry =>
          entry.id === item.id ? { ...entry, ...updated } : entry
        )
      );
    } catch (err) {
      console.error('No se pudo actualizar la orden de trabajo', err);
      this.error.set('No logramos actualizar la orden seleccionada.');
    } finally {
      this.updatingId.set(null);
    }
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private toKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private toLabel(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  }

  toDateValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const offset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - offset);
    return local.toISOString().slice(0, 10);
  }

  toTimeValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().slice(11, 16);
  }

  private formatRangeLabel(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  private normalizeDateTimeValue(value: string): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toISOString();
  }

  private combineDateTime(dateValue: string, timeValue: string): string {
    const normalizedTime = timeValue && timeValue.length >= 4 ? timeValue : '00:00';
    const iso = `${dateValue}T${normalizedTime}`;
    const date = new Date(iso);
    return this.normalizeDateTimeValue(date.toISOString());
  }
}

