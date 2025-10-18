import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-operator-inbox-placeholder',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="placeholder">
      <h1>{{ title() }}</h1>
      <p>{{ description() }}</p>
      <button type="button" routerLink="/operador/solicitudes">Volver a solicitudes</button>
    </section>
  `,
  styles: [`
    .placeholder {
      background: rgba(16, 33, 51, 0.92);
      border: 1px dashed rgba(148, 163, 184, 0.3);
      border-radius: 18px;
      padding: 48px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: flex-start;
      color: #cbd5f5;
    }
    .placeholder h1 {
      margin: 0;
      font-size: 26px;
      color: #f8fafc;
    }
    .placeholder p {
      margin: 0;
      max-width: 520px;
    }
    .placeholder button {
      background: #fbbf24;
      color: #0c1420;
      border: 0;
      padding: 12px 22px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
    }
  `]
})
export class OperatorInboxPlaceholderPage {
  private readonly route = inject(ActivatedRoute);

  readonly title = computed(() => {
    const view = (this.route.snapshot.data['view'] as string) || 'cotizaciones';
    return view === 'pagos' ? 'Pagos en preparacion' : 'Cotizaciones recientes';
  });

  readonly description = computed(() => {
    const view = (this.route.snapshot.data['view'] as string) || 'cotizaciones';
    if (view === 'pagos') {
      return 'Aqui podras revisar las confirmaciones de pago y coordinar la emision de boletas o facturas.';
    }
    return 'Muy pronto podras gestionar las cotizaciones directas desde este panel y asignarlas a produccion.';
  });
}
