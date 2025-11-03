import { Component, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PedidosService, CreatePedidoRequest } from '../../services/pedidos.service';
import { CartService } from '../../services/cart.service';
import type { PackableItem, PackOptions, PackedPlacement } from '../../utils/polygon-packer';

interface MaterialPreset {
  id: string;
  label: string;
  description: string;
  rollWidthCm: number;
  pricePerMeter: number;
}

interface DesignItem {
  id: number;
  file: File;
  previewUrl: string | null;
  displayName: string;
  quantity: number;
  sizeCm: number;
  widthCm: number;
  heightCm: number;
  aspectRatio: number;
  revokeOnDestroy: boolean;
  sizeMode: SizeMode;
  customWidthCm?: number;
  customHeightCm?: number;
  coverageRatio?: number;
  outlinePath?: string | null;
  trimmedWidthPx?: number;
  trimmedHeightPx?: number;
  pixelArea?: number;
  polygon: Float32Array | null;
}

interface PackingMeta {
  itemId: number;
  copyIndex: number;
  clipPath: string | null;
  previewUrl: string | null;
}

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  designWidth: number;
  designHeight: number;
  margin: number;
  rotation: number;
  previewUrl: string | null;
  clipPath?: string | null;
  itemId: number;
  copyIndex: number;
}

interface ProcessedImage {
  url: string;
  aspectRatio: number;
  clipPath: string | null;
  coverage: number;
  trimmedWidth: number;
  trimmedHeight: number;
  pixelArea: number;
  polygon: Float32Array;
}

type SizeMode = 'width' | 'height' | 'custom';

interface PackResult {
  placements: Placement[];
  usedHeight: number;
}

type WorkerSuccessMessage = {
  id: number;
  type: 'success';
  placements: Array<PackedPlacement<PackingMeta>>;
  usedHeight: number;
};

type WorkerErrorMessage = { id: number; type: 'error'; message: string };
type PackWorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

@Component({
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, RouterLink],
  templateUrl: './nuevo-pedido.page.html',
  styleUrls: ['./nuevo-pedido.page.css']
})
export class NuevoPedidoPage implements OnDestroy {
  private nextId = 1;
  private readonly cutMarginMm = 8;
  private readonly defaultPolygon = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  private readonly maxPreviewDimension = 1400;
  private readonly pedidos = inject(PedidosService);
  private readonly cart = inject(CartService);
  private packWorker: Worker;
  private packDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private latestPackRequest = 0;
  private readonly packResultState = signal<PackResult>({ placements: [], usedHeight: 0 });

  orderNote = '';
  submitting = false;
  submitFeedback: { type: 'success' | 'error'; message: string } | null = null;
  cartFeedback: { type: 'success' | 'error'; message: string } | null = null;
  private cartFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  materials: MaterialPreset[] = [
    { id: 'dtf-57', label: 'DTF 57 cm', description: 'Impresion a todo color para prendas claras y oscuras.', rollWidthCm: 57, pricePerMeter: 13000 },
    { id: 'vinilo-textil', label: 'Vinilo textil (ploteo) 47 cm', description: 'Solo corte vector, ideal para nombres y dorsales.', rollWidthCm: 47, pricePerMeter: 10000 },
    { id: 'vinilo-decorativo', label: 'Vinilo decorativo 56 cm', description: 'Impresion y corte para stickers decorativos o murales.', rollWidthCm: 56, pricePerMeter: 10000 },
    { id: 'sticker-70', label: 'Sticker 70 cm', description: 'Pensado para stickers troquelados con tinta de corte.', rollWidthCm: 70, pricePerMeter: 7000 },
    { id: 'comprinter-pvc', label: 'Comprinter PVC 47 cm', description: 'Impresion y corte para telas tecnicas.', rollWidthCm: 47, pricePerMeter: 7500 },
    { id: 'comprinter-pu', label: 'Comprinter PU 47 cm', description: 'Mayor elasticidad, recomendado para prendas deportivas.', rollWidthCm: 47, pricePerMeter: 8500 }
  ];

  selectedMaterialId = this.materials[0].id;

  items = signal<DesignItem[]>([]);
  previewImage = signal<string | null>(null);

  currentMaterial = computed(() => this.materials.find(m => m.id === this.selectedMaterialId) ?? null);

  materialDescription = computed(() => this.currentMaterial()?.description ?? '');
  packing = signal(false);
  packResult = computed(() => this.packResultState());

  constructor() {
    this.packWorker = new Worker(new URL('../../workers/packer.worker', import.meta.url), { type: 'module' });
    this.packWorker.onmessage = (event: MessageEvent<PackWorkerMessage>) => this.handleWorkerMessage(event.data);
    this.packWorker.onerror = () => {
      this.packing.set(false);
    };

    effect(() => {
      const material = this.currentMaterial();
      const items = this.items();
      this.onInputsChanged(material, items);
    });
  }


  private onInputsChanged(material: MaterialPreset | null, items: DesignItem[]): void {
    if (!material || !items.length) {
      if (this.packDebounceTimer) {
        clearTimeout(this.packDebounceTimer);
        this.packDebounceTimer = null;
      }
      this.resetPackResult();
      return;
    }
    this.schedulePack();
  }

  private schedulePack(): void {
    if (this.packDebounceTimer) {
      clearTimeout(this.packDebounceTimer);
    }
    this.packDebounceTimer = setTimeout(() => this.sendPackRequest(), 120);
  }

  private sendPackRequest(): void {
    if (this.packDebounceTimer) {
      clearTimeout(this.packDebounceTimer);
      this.packDebounceTimer = null;
    }
    const material = this.currentMaterial();
    const items = this.items();
    if (!material || !items.length) {
      this.resetPackResult();
      return;
    }

    const packItems = this.buildPackItems(items);
    if (!packItems.length) {
      this.resetPackResult();
      return;
    }

    this.packing.set(true);
    const requestId = ++this.latestPackRequest;
    const options: PackOptions = {
      rollWidthCm: material.rollWidthCm,
      marginMm: this.cutMarginMm,
      rotationStepDeg: 15
    };
    this.packWorker.postMessage({ id: requestId, items: packItems, options });
  }

  private buildPackItems(items: DesignItem[]): Array<PackableItem<PackingMeta>> {
    const packItems: Array<PackableItem<PackingMeta>> = [];
    for (const item of items) {
      const polygon = item.polygon && item.polygon.length >= 6 ? item.polygon : this.defaultPolygon;
      const dims = this.getEffectiveDimensions(item);
      for (let copyIndex = 0; copyIndex < item.quantity; copyIndex++) {
        packItems.push({
          widthCm: dims.width,
          heightCm: dims.height,
          polygon,
          meta: {
            itemId: item.id,
            copyIndex,
            clipPath: item.outlinePath ?? null,
            previewUrl: item.previewUrl ?? null
          }
        });
      }
    }
    return packItems;
  }

  private handleWorkerMessage(message: PackWorkerMessage): void {
    if (message.id !== this.latestPackRequest) {
      return;
    }
    this.packing.set(false);
    if (message.type === 'error') {
      console.warn('Pack worker error', message.message);
      this.resetPackResult();
      return;
    }

    const placements: Placement[] = message.placements.map(place => ({
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      designWidth: place.designWidth,
      designHeight: place.designHeight,
      margin: place.margin,
      rotation: place.rotation,
      previewUrl: place.meta.previewUrl ?? null,
      clipPath: place.clipPath ?? null,
      itemId: place.meta.itemId,
      copyIndex: place.meta.copyIndex
    }));

    this.packResultState.set({
      placements,
      usedHeight: Number(message.usedHeight.toFixed(2))
    });
  }

  private resetPackResult(): void {
    this.latestPackRequest++;
    this.packing.set(false);
    this.packResultState.set({ placements: [], usedHeight: 0 });
  }

  columnOptions = computed(() => {
    const material = this.currentMaterial();
    if (!material) return [];
    const maxWidth = material.rollWidthCm || 1;
    const spacing = this.cutSpacingCm();
    const maxColumns = Math.min(8, Math.floor(maxWidth / (5 + spacing)));
    const options: number[] = [];
    for (let cols = 2; cols <= maxColumns; cols++) {
      options.push(cols);
    }
    return options;
  });

  panelPadding = computed(() => {
    const material = this.currentMaterial();
    if (!material) return 100;
    const width = material.rollWidthCm || 1;
    const usedHeight = this.packResult().usedHeight;
    if (usedHeight <= 0) {
      return 100;
    }
    return Math.max((usedHeight / width) * 100, 20);
  });

  panelCells = computed(() => {
    const material = this.currentMaterial();
    if (!material) return [];
    const pack = this.packResult();
    if (pack.placements.length === 0) return [];
    const rollWidth = material.rollWidthCm || 1;
    const usedHeight = Math.max(pack.usedHeight, 1);
    return pack.placements.map(cell => ({
      left: (cell.x / rollWidth) * 100,
      top: (cell.y / usedHeight) * 100,
      width: (cell.width / rollWidth) * 100,
      height: (cell.height / usedHeight) * 100,
      previewUrl: cell.previewUrl,
      clipPath: cell.clipPath ?? null,
      rotation: cell.rotation ?? 0,
      margin: cell.margin,
      contentWidth: cell.width > 0
        ? Math.min(100, Math.max(5, (cell.designWidth / cell.width) * 100))
        : 100,
      contentHeight: cell.height > 0
        ? Math.min(100, Math.max(5, (cell.designHeight / cell.height) * 100))
        : 100
    }));
  });

  totalPrice = computed(() => {
    const material = this.currentMaterial();
    if (!material) return 0;
    const usedHeight = this.packResult().usedHeight;
    const proportion = Math.max(0.2, usedHeight / 100);
    return Math.round(material.pricePerMeter * proportion);
  });

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  saveQuoteToCart() {
    if (this.items().length === 0) {
      this.setCartFeedback('error', 'Agrega al menos un diseño antes de guardar la cotización.');
      return;
    }
    const material = this.currentMaterial();
    if (!material) {
      this.setCartFeedback('error', 'Selecciona un material para estimar tu cotización.');
      return;
    }

    const pack = this.packResult();
    const items = this.items().map(item => {
      const dims = this.getEffectiveDimensions(item);
      return {
        name: item.displayName,
        quantity: item.quantity,
        widthCm: Number(dims.width.toFixed(2)),
        heightCm: Number(dims.height.toFixed(2))
      };
    });

    if (!items.length) {
      this.setCartFeedback('error', 'No se pudo preparar la cotización. Revisa tus archivos.');
      return;
    }

    this.cart.setQuote({
      materialId: material.id,
      materialLabel: material.label,
      totalPrice: this.totalPrice(),
      usedHeight: Number(pack.usedHeight.toFixed(2)),
      note: this.orderNote.trim() ? this.orderNote.trim() : undefined,
      items,
      createdAt: new Date().toISOString()
    });

    this.setCartFeedback('success', 'Cotización guardada en tu carrito.');
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    await this.appendFiles(event.dataTransfer?.files);
  }

  async onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    await this.appendFiles(input.files);
    input.value = '';
  }

  private async appendFiles(fileList: FileList | null | undefined) {
    if (!fileList || fileList.length === 0) return;
    const available = Math.max(0, 20 - this.items().length);
    if (available === 0) return;
    const files = Array.from(fileList).slice(0, available);
    const prepared = await Promise.all(files.map(file => this.prepareItem(file)));
    const valid = prepared.filter((item): item is DesignItem => !!item);
    if (!valid.length) return;
    const material = this.currentMaterial();
    const adjusted = material ? valid.map(item => this.clampToMaterial(item, material)) : valid;
    this.items.update(curr => [...curr, ...adjusted]);
  }

  private async uploadPedidoAttachments(
    pedidoId: number,
    files: File[]
  ): Promise<Array<{ filename: string; message: string }>> {
    const errors: Array<{ filename: string; message: string }> = [];
    const chunkSize = 10;
    for (let idx = 0; idx < files.length; idx += chunkSize) {
      const chunk = files.slice(idx, idx + chunkSize);
      if (!chunk.length) {
        continue;
      }
      try {
        const response: any = await firstValueFrom(this.pedidos.uploadAttachments(pedidoId, chunk));
        const chunkErrors = Array.isArray(response?.errors) ? response.errors : [];
        errors.push(
          ...chunkErrors.map((item: any) => ({
            filename: String(item?.filename ?? 'archivo'),
            message: String(item?.message ?? 'No se pudo subir el archivo')
          }))
        );
      } catch (error) {
        console.error('Error subiendo archivos adjuntos', error);
        chunk.forEach(file => {
          errors.push({
            filename: file.name,
            message: 'Error al subir el archivo'
          });
        });
      }
    }
    return errors;
  }

  private async prepareItem(file: File): Promise<DesignItem | null> {
    if (file.type.startsWith('image/')) {
      const processed = await this.makeTransparentPreview(file);
      const aspect = processed?.aspectRatio ?? 1;
      const base: DesignItem = {
        id: this.nextId++,
        file,
        previewUrl: processed?.url ?? null,
        displayName: file.name,
        quantity: 1,
        sizeCm: 25,
        widthCm: 25,
        heightCm: 25 / aspect,
        aspectRatio: aspect,
        revokeOnDestroy: false,
        sizeMode: 'width',
        coverageRatio: processed?.coverage ?? undefined,
        outlinePath: processed?.clipPath ?? null,
        trimmedWidthPx: processed?.trimmedWidth ?? undefined,
        trimmedHeightPx: processed?.trimmedHeight ?? undefined,
        pixelArea: processed?.pixelArea ?? undefined,
        polygon: processed?.polygon ?? this.defaultPolygon
      };
      return this.withWidth(base, base.sizeCm);
    }

    const fallback: DesignItem = {
      id: this.nextId++,
      file,
      previewUrl: null,
      displayName: file.name,
      quantity: 1,
      sizeCm: 25,
      widthCm: 25,
      heightCm: 25,
      aspectRatio: 1,
      revokeOnDestroy: false,
      sizeMode: 'width',
      coverageRatio: 1,
      outlinePath: null,
      trimmedWidthPx: undefined,
      trimmedHeightPx: undefined,
      pixelArea: undefined,
      polygon: this.defaultPolygon
    };
    return this.withWidth(fallback, fallback.sizeCm);
  }

  private makeTransparentPreview(file: File): Promise<ProcessedImage | null> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const originalWidth = Math.max(1, img.naturalWidth || img.width || 1);
          const originalHeight = Math.max(1, img.naturalHeight || img.height || 1);
          const longestSide = Math.max(originalWidth, originalHeight);
          const rawScale =
            longestSide > this.maxPreviewDimension ? this.maxPreviewDimension / longestSide : 1;
          const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
          const targetWidth = Math.max(1, Math.round(originalWidth * scale));
          const targetHeight = Math.max(1, Math.round(originalHeight * scale));
          const scaleInverse = scale > 0 ? 1 / scale : 1;
          const areaScale = scaleInverse * scaleInverse;

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            if (reader.result) {
              const rawUrl = reader.result as string;
              resolve({
                url: rawUrl,
                aspectRatio: originalWidth / originalHeight || 1,
                clipPath: null,
                coverage: 1,
                trimmedWidth: originalWidth,
                trimmedHeight: originalHeight,
                pixelArea: originalWidth * originalHeight,
                polygon: this.defaultPolygon
              });
            } else {
              resolve(null);
            }
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
          const data = imageData.data;
          const width = targetWidth;
          const height = targetHeight;

          const samples: number[][] = [];
          const stepX = Math.max(1, Math.floor(width / 40));
          const stepY = Math.max(1, Math.floor(height / 40));
          const sample = (sx: number, sy: number) => {
            const idx = (sy * width + sx) * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
          };
          for (let x = 0; x < width; x += stepX) {
            sample(x, 0);
            sample(x, height - 1);
          }
          for (let y = 0; y < height; y += stepY) {
            sample(0, y);
            sample(width - 1, y);
          }

          const [avgR, avgG, avgB] = samples
            .reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0])
            .map(channel => channel / samples.length) as [number, number, number];
          const avgBrightness = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;

          const visited = new Uint8Array(width * height);
          const queue = new Uint32Array(width * height);
          let head = 0;
          let tail = 0;
          const colorThreshold = 90;
          const brightnessThreshold = 75;

          const push = (px: number, py: number) => {
            if (px < 0 || py < 0 || px >= width || py >= height) return;
            const idx = py * width + px;
            if (visited[idx]) return;
            const base = idx * 4;
            const r = data[base];
            const g = data[base + 1];
            const b = data[base + 2];
            const colorDist = Math.sqrt(
              (r - avgR) * (r - avgR) + (g - avgG) * (g - avgG) + (b - avgB) * (b - avgB)
            );
            const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (colorDist <= colorThreshold && Math.abs(brightness - avgBrightness) <= brightnessThreshold) {
              visited[idx] = 1;
              queue[tail++] = idx;
            }
          };

          for (let x = 0; x < width; x++) {
            push(x, 0);
            push(x, height - 1);
          }
          for (let y = 0; y < height; y++) {
            push(0, y);
            push(width - 1, y);
          }

          const neighbors = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ];

          while (head < tail) {
            const idx = queue[head++];
            const base = idx * 4;
            data[base + 3] = 0;
            const px = idx % width;
            const py = Math.floor(idx / width);
            for (const [dx, dy] of neighbors) {
              push(px + dx, py + dy);
            }
          }

          ctx.putImageData(imageData, 0, 0);

          let minX = width;
          let minY = height;
          let maxX = -1;
          let maxY = -1;
          for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
              const alpha = data[(py * width + px) * 4 + 3];
              if (alpha > 10) {
                if (px < minX) minX = px;
                if (py < minY) minY = py;
                if (px > maxX) maxX = px;
                if (py > maxY) maxY = py;
              }
            }
          }

          if (maxX < minX || maxY < minY) {
            const fallbackUrl = canvas.toDataURL('image/png');
            const safeWidth = Math.max(1, Math.round(canvas.width * scaleInverse));
            const safeHeight = Math.max(1, Math.round(canvas.height * scaleInverse));
            resolve({
              url: fallbackUrl,
              aspectRatio: safeWidth / safeHeight || 1,
              clipPath: null,
              coverage: 0,
              trimmedWidth: safeWidth,
              trimmedHeight: safeHeight,
              pixelArea: 0,
              polygon: this.defaultPolygon
            });
            return;
          }

          const trimmedWidth = maxX - minX + 1;
          const trimmedHeight = maxY - minY + 1;
          const trimmed = document.createElement('canvas');
          const safeTrimmedWidth = Math.max(1, trimmedWidth);
          const safeTrimmedHeight = Math.max(1, trimmedHeight);
          trimmed.width = safeTrimmedWidth;
          trimmed.height = safeTrimmedHeight;
          const trimmedCtx = trimmed.getContext('2d');
          if (!trimmedCtx) {
            resolve({
              url: canvas.toDataURL('image/png'),
              aspectRatio: safeTrimmedWidth / safeTrimmedHeight || 1,
              clipPath: null,
              coverage: 1,
              trimmedWidth: Math.max(1, Math.round(safeTrimmedWidth * scaleInverse)),
              trimmedHeight: Math.max(1, Math.round(safeTrimmedHeight * scaleInverse)),
              pixelArea: Math.max(1, Math.round(safeTrimmedWidth * safeTrimmedHeight * areaScale)),
              polygon: this.defaultPolygon
            });
            return;
          }
          trimmedCtx.putImageData(imageData, -minX, -minY);
          const trimmedData = trimmedCtx.getImageData(0, 0, safeTrimmedWidth, safeTrimmedHeight);
          const tData = trimmedData.data;
          const pad = Math.max(1, Math.floor(Math.max(safeTrimmedWidth, safeTrimmedHeight) * 0.02));
          for (let py = 0; py < safeTrimmedHeight; py++) {
            for (let px = 0; px < safeTrimmedWidth; px++) {
              if (px < pad || px >= safeTrimmedWidth - pad || py < pad || py >= safeTrimmedHeight - pad) {
                tData[(py * safeTrimmedWidth + px) * 4 + 3] = 0;
              }
            }
          }
          trimmedCtx.putImageData(trimmedData, 0, 0);
          const metrics = this.computeMaskMetrics(trimmedData, safeTrimmedWidth, safeTrimmedHeight);
          const baseUrl = trimmed.toDataURL('image/png');
          const trimmedWidthPx = Math.max(1, Math.round(safeTrimmedWidth * scaleInverse));
          const trimmedHeightPx = Math.max(1, Math.round(safeTrimmedHeight * scaleInverse));
          const pixelArea = Math.max(0, Math.round(metrics.pixelArea * areaScale));
          resolve({
            url: baseUrl,
            aspectRatio: safeTrimmedWidth / safeTrimmedHeight || 1,
            clipPath: metrics.clipPath,
            coverage: metrics.coverage,
            trimmedWidth: trimmedWidthPx,
            trimmedHeight: trimmedHeightPx,
            pixelArea,
            polygon: metrics.polygon ?? this.defaultPolygon
          });
        };
        img.onerror = () => {
          if (reader.result) {
            const fallbackUrl = reader.result as string;
            const fallbackWidth = Math.max(1, img.naturalWidth || img.width || 1);
            const fallbackHeight = Math.max(1, img.naturalHeight || img.height || 1);
            resolve({
              url: fallbackUrl,
              aspectRatio: fallbackWidth / fallbackHeight || 1,
              clipPath: null,
              coverage: 1,
              trimmedWidth: fallbackWidth,
              trimmedHeight: fallbackHeight,
              pixelArea: Math.max(1, fallbackWidth * fallbackHeight),
              polygon: this.defaultPolygon
            });
          } else {
            resolve(null);
          }
        };
        img.src = reader.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  adjustQuantity(id: number, delta: number) {
    this.items.update(curr =>
      curr.map(item =>
        item.id === id
          ? { ...item, quantity: Math.min(50, Math.max(1, item.quantity + delta)) }
          : item
      )
    );
  }

  adjustSize(id: number, delta: number) {
    this.updateItem(id, item => {
      if (item.sizeMode === 'custom') {
        return item;
      }
      const base = item.sizeMode === 'width' ? item.widthCm : item.heightCm;
      const next = this.constrainPrimary(base + delta);
      return item.sizeMode === 'width' ? this.withWidth(item, next) : this.withHeight(item, next);
    });
  }

  setSize(id: number, rawValue: number | string) {
    const parsed = this.parseNumber(rawValue);
    if (parsed === null) return;
    this.updateItem(id, item => {
      if (item.sizeMode === 'custom') {
        return item;
      }
      const next = this.constrainPrimary(parsed);
      return item.sizeMode === 'width' ? this.withWidth(item, next) : this.withHeight(item, next);
    });
  }

  setSizeMode(id: number, mode: SizeMode) {
    this.updateItem(id, item => {
      if (mode === 'custom') {
        return this.withCustom(item, item.widthCm, item.heightCm);
      }
      if (mode === 'width') {
        return this.withWidth(item, item.widthCm);
      }
      return this.withHeight(item, item.heightCm);
    });
  }

  setCustomDimension(id: number, dimension: 'width' | 'height', rawValue: number | string) {
    const parsed = this.parseNumber(rawValue);
    if (parsed === null) return;
    this.updateItem(id, item => {
      const baseWidth = item.customWidthCm ?? item.widthCm;
      const baseHeight = item.customHeightCm ?? item.heightCm;
      const constrained = this.constrainCustom(parsed);
      const width = dimension === 'width' ? constrained : baseWidth;
      const height = dimension === 'height' ? constrained : baseHeight;
      return this.withCustom(item, width, height);
    });
  }

  onMaterialChange(materialId: string) {
    const material = this.materials.find(m => m.id === materialId) ?? null;
    this.items.update(curr => curr.map(item => this.clampToMaterial(item, material)));
  }

  getSizeNote(item: DesignItem): string | null {
    const material = this.currentMaterial();
    if (!material) return null;
    const dims = this.getEffectiveDimensions(item);
    const maxWidth = material.rollWidthCm || 1;
    if (dims.width >= maxWidth - 0.2) {
      return `Ancho limitado por el material (${maxWidth} cm).`;
    }
    return null;
  }

  fitColumns(id: number, columns: number) {
    const material = this.currentMaterial();
    if (!material || columns < 1) return;
    if (!this.columnOptions().includes(columns)) return;
    const spacing = this.cutSpacingCm();
    const available = material.rollWidthCm - columns * spacing;
    if (available <= 0) return;
    const targetWidth = this.clampDisplay(Math.max(5, available / columns));
    this.updateItem(id, item => {
      const ratio = item.aspectRatio > 0 ? item.aspectRatio : 1;
      if (item.sizeMode === 'height') {
        const targetHeight = targetWidth / ratio;
        return this.withHeight(item, targetHeight);
      }
      if (item.sizeMode === 'custom') {
        return this.withCustom(item, targetWidth, item.heightCm);
      }
      return this.withWidth(item, targetWidth);
    });
  }

  async submitOrder() {
    if (this.submitting || this.items().length === 0) {
      return;
    }
    const material = this.currentMaterial();
    if (!material) {
      this.submitFeedback = { type: 'error', message: 'Selecciona un material antes de enviar tu pedido.' };
      return;
    }

    this.submitting = true;
    this.submitFeedback = null;

    try {
      const pack = this.packResult();
      const designItems = this.items();
      const payload: CreatePedidoRequest = {
        materialId: material.id,
        materialLabel: material.label,
        materialWidthCm: material.rollWidthCm,
        usedHeight: pack.usedHeight,
        totalPrice: this.totalPrice(),
        note: this.orderNote.trim() ? this.orderNote.trim() : undefined,
        items: designItems.map(item => {
          const dims = this.getEffectiveDimensions(item);
          return {
            displayName: item.displayName,
            quantity: item.quantity,
            widthCm: Number(dims.width.toFixed(2)),
            heightCm: Number(dims.height.toFixed(2)),
            sizeMode: item.sizeMode,
            previewUrl: undefined, // omit base64 previews para mantener payload liviano
            coverageRatio: typeof item.coverageRatio === 'number' ? Number(item.coverageRatio.toFixed(4)) : undefined,
            outlinePath: item.outlinePath ?? undefined,
            pixelArea: typeof item.pixelArea === 'number' ? Math.round(item.pixelArea) : undefined,
            trimmedWidthPx: item.trimmedWidthPx ?? undefined,
            trimmedHeightPx: item.trimmedHeightPx ?? undefined
          };
        }),
        placements: pack.placements.map(cell => ({
          x: Number(cell.x.toFixed(2)),
          y: Number(cell.y.toFixed(2)),
          width: Number(cell.width.toFixed(2)),
          height: Number(cell.height.toFixed(2)),
          designWidth: Number(cell.designWidth.toFixed(2)),
          designHeight: Number(cell.designHeight.toFixed(2)),
          margin: Number(cell.margin.toFixed(2)),
          itemId: cell.itemId,
          copyIndex: cell.copyIndex,
          clipPath: cell.clipPath ?? undefined,
          rotation: cell.rotation
        }))
      };

      const created = await firstValueFrom(this.pedidos.createPedido(payload));
      const pedidoId = created?.id;
      if (!pedidoId) {
        throw new Error('No pudimos obtener el identificador del pedido creado.');
      }

      const filesToUpload = designItems
        .map(item => item.file)
        .filter((file): file is File => !!file);

      const uploadErrors = filesToUpload.length
        ? await this.uploadPedidoAttachments(pedidoId, filesToUpload)
        : [];

      if (uploadErrors.length) {
        const failedNames = uploadErrors.map(error => error.filename).join(', ');
        this.submitFeedback = {
          type: 'error',
          message:
            `El pedido #${pedidoId} se registro, pero algunos archivos no se pudieron subir (${failedNames}). ` +
            'Puedes adjuntarlos nuevamente desde "Mis pedidos".'
        };
      } else if (filesToUpload.length) {
        this.submitFeedback = {
          type: 'success',
          message: 'Tu solicitud y los archivos fueron enviados. Estamos procesando tu pedido.'
        };
      } else {
        this.submitFeedback = {
          type: 'success',
          message: 'Tu solicitud fue enviada al equipo operador.'
        };
      }
      this.clearOrder();
    } catch (error) {
      console.error('Error al enviar el pedido', error);
      const status = (error as HttpErrorResponse)?.status;
      const serverMessage = (error as HttpErrorResponse)?.error?.message;
      this.submitFeedback = {
        type: 'error',
        message: serverMessage || 'No pudimos enviar tu pedido. Intentalo nuevamente.'
      };
    } finally {
      this.submitting = false;
    }
  }

  private clearOrder() {
    this.items().forEach(item => {
      if (item.previewUrl && item.revokeOnDestroy) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    this.items.set([]);
    this.previewImage.set(null);
    this.orderNote = '';
    this.nextId = 1;
  }

  removeItem(id: number) {
    const removed = this.items().find(item => item.id === id);
    if (removed?.previewUrl && removed.revokeOnDestroy) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    this.items.update(curr => curr.filter(item => item.id !== id));
  }

  private updateItem(id: number, mutator: (item: DesignItem) => DesignItem): void {
    const material = this.currentMaterial();
    this.items.update(curr =>
      curr.map(item => {
        if (item.id !== id) return item;
        const updated = mutator(item);
        return this.clampToMaterial(updated, material);
      })
    );
  }

  openPreview(item: DesignItem) {
    if (!item.previewUrl) return;
    this.previewImage.set(item.previewUrl);
  }

  closePreview() {
    this.previewImage.set(null);
  }

  ngOnDestroy(): void {
    if (this.cartFeedbackTimer) {
      clearTimeout(this.cartFeedbackTimer);
    }
    if (this.packDebounceTimer) {
      clearTimeout(this.packDebounceTimer);
      this.packDebounceTimer = null;
    }
    this.packWorker.terminate();
    this.items().forEach(item => {
      if (item.previewUrl && item.revokeOnDestroy) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }

  private clampToMaterial(item: DesignItem, material: MaterialPreset | null): DesignItem {
    if (!material) return item;
    const maxWidth = Math.max(5, material.rollWidthCm - this.cutSpacingCm());
    const ratio = item.aspectRatio > 0 ? item.aspectRatio : 1;
    if (item.sizeMode === 'custom') {
      const width = this.clampDisplay(Math.min(Math.max(5, item.widthCm), maxWidth));
      const height = this.clampDisplay(item.heightCm);
      return this.withCustom(item, width, height);
    }
    if (item.sizeMode === 'width') {
      const width = this.clampDisplay(Math.min(Math.max(5, item.widthCm), maxWidth));
      return this.withWidth(item, width);
    }
    const maxHeight = this.clampDisplay(maxWidth / ratio);
    if (item.heightCm <= maxHeight + 1e-6) {
      return item;
    }
    return this.withHeight(item, maxHeight);
  }

  private parseNumber(raw: number | string): number | null {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const value = Number(trimmed.replace(',', '.'));
      return Number.isFinite(value) ? value : null;
    }
    return null;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private clampDisplay(value: number): number {
    const safe = Number.isFinite(value) ? value : 1;
    return Math.max(1, this.round(safe));
  }

  private cutSpacingCm(): number {
    return Math.max(0.2, (this.cutMarginMm / 10) * 2);
  }

  private constrainPrimary(value: number): number {
    const safe = this.round(Number.isFinite(value) ? value : 10);
    return Math.min(60, Math.max(5, safe));
  }

  private constrainCustom(value: number): number {
    const safe = this.round(Number.isFinite(value) ? value : 10);
    return Math.min(120, Math.max(5, safe));
  }

  private withWidth(item: DesignItem, widthCm: number): DesignItem {
    const safeRatio = item.aspectRatio > 0 ? item.aspectRatio : 1;
    const width = this.clampDisplay(widthCm);
    const height = this.clampDisplay(width / safeRatio);
    return {
      ...item,
      sizeMode: 'width',
      sizeCm: width,
      widthCm: width,
      heightCm: height,
      customWidthCm: undefined,
      customHeightCm: undefined
    };
  }

  private withHeight(item: DesignItem, heightCm: number): DesignItem {
    const safeRatio = item.aspectRatio > 0 ? item.aspectRatio : 1;
    const height = this.clampDisplay(heightCm);
    const width = this.clampDisplay(height * safeRatio);
    return {
      ...item,
      sizeMode: 'height',
      sizeCm: height,
      widthCm: width,
      heightCm: height,
      customWidthCm: undefined,
      customHeightCm: undefined
    };
  }

  private withCustom(item: DesignItem, widthCm: number, heightCm: number): DesignItem {
    const width = this.clampDisplay(widthCm);
    const height = this.clampDisplay(heightCm);
    return {
      ...item,
      sizeMode: 'custom',
      sizeCm: Math.max(width, height),
      widthCm: width,
      heightCm: height,
      customWidthCm: width,
      customHeightCm: height
    };
  }

  private getEffectiveDimensions(item: DesignItem): { width: number; height: number } {
    const safeRatio = item.aspectRatio > 0 ? item.aspectRatio : 1;
    if (item.sizeMode === 'custom') {
      const width = this.clampDisplay(item.customWidthCm ?? item.widthCm);
      const height = this.clampDisplay(item.customHeightCm ?? item.heightCm);
      return { width, height };
    }
    if (item.sizeMode === 'height') {
      const height = this.clampDisplay(item.heightCm);
      const width = this.clampDisplay(height * safeRatio);
      return { width, height };
    }
    const width = this.clampDisplay(item.widthCm);
    const height = this.clampDisplay(width / safeRatio);
    return { width, height };
  }

  private computeMaskMetrics(imageData: ImageData, width: number, height: number): { clipPath: string | null; coverage: number; pixelArea: number; polygon: Float32Array | null } {
    const totalPixels = Math.max(1, width * height);
    const data = imageData.data;
    const mask = new Uint8Array(totalPixels);
    let occupied = 0;
    for (let idx = 0; idx < totalPixels; idx++) {
      if (data[idx * 4 + 3] > 10) {
        mask[idx] = 1;
        occupied++;
      }
    }
    if (!occupied) {
      return { clipPath: null, coverage: 0, pixelArea: 0, polygon: null };
    }

    const component = this.extractLargestComponent(mask, width, height);
    const outlinePoints = component ? this.traceOutline(component, width, height) : null;
    const clipPath =
      outlinePoints && outlinePoints.length >= 3 ? this.buildClipPath(outlinePoints, width, height) : null;

    let polygon: Float32Array | null = null;
    if (outlinePoints && outlinePoints.length >= 3) {
      polygon = new Float32Array(outlinePoints.length * 2);
      for (let i = 0; i < outlinePoints.length; i++) {
        const point = outlinePoints[i];
        polygon[i * 2] = (point.x + 0.5) / width;
        polygon[i * 2 + 1] = (point.y + 0.5) / height;
      }
    }

    return {
      clipPath,
      coverage: occupied / totalPixels,
      pixelArea: occupied,
      polygon
    };
  }

  private extractLargestComponent(mask: Uint8Array, width: number, height: number): Uint8Array | null {
    const total = mask.length;
    const visited = new Uint8Array(total);
    const neighborOffsets = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: -1 }
    ];

    let bestStart = -1;
    let bestSize = 0;

    for (let idx = 0; idx < total; idx++) {
      if (!mask[idx] || visited[idx]) continue;
      const stack: number[] = [idx];
      visited[idx] = 1;
      let size = 0;
      while (stack.length) {
        const current = stack.pop()!;
        size++;
        const cx = current % width;
        const cy = Math.floor(current / width);
        for (const { dx, dy } of neighborOffsets) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (!mask[nIdx] || visited[nIdx]) continue;
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestStart = idx;
      }
    }

    if (bestStart === -1) {
      return null;
    }

    const component = new Uint8Array(total);
    const queue: number[] = [bestStart];
    component[bestStart] = 1;
    while (queue.length) {
      const current = queue.pop()!;
      const cx = current % width;
      const cy = Math.floor(current / width);
      for (const { dx, dy } of neighborOffsets) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!mask[nIdx] || component[nIdx]) continue;
        component[nIdx] = 1;
        queue.push(nIdx);
      }
    }

    return component;
  }

  private traceOutline(component: Uint8Array, width: number, height: number): Array<{ x: number; y: number }> | null {
    const get = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0;
      return component[y * width + x];
    };

    let startX = -1;
    let startY = -1;
    outer: for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!get(x, y)) continue;
        if (!get(x - 1, y) || !get(x + 1, y) || !get(x, y - 1) || !get(x, y + 1)) {
          startX = x;
          startY = y;
          break outer;
        }
      }
    }

    if (startX === -1 || startY === -1) {
      return null;
    }

    const neighbors = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: -1 }
    ];

    const outline: Array<{ x: number; y: number }> = [];
    let currentX = startX;
    let currentY = startY;
    let prevX = startX - 1;
    let prevY = startY;
    let guard = 0;
    const guardLimit = width * height * 8;

    do {
      outline.push({ x: currentX, y: currentY });
      let startDir = neighbors.findIndex(n => currentX + n.dx === prevX && currentY + n.dy === prevY);
      if (startDir === -1) startDir = 0;
      let found = false;
      for (let offset = 1; offset <= neighbors.length; offset++) {
        const dirIndex = (startDir + offset) % neighbors.length;
        const n = neighbors[dirIndex];
        const nx = currentX + n.dx;
        const ny = currentY + n.dy;
        if (!get(nx, ny)) continue;
        prevX = currentX;
        prevY = currentY;
        currentX = nx;
        currentY = ny;
        found = true;
        break;
      }
      if (!found) {
        break;
      }
      guard++;
    } while ((currentX !== startX || currentY !== startY || prevX !== startX - 1 || prevY !== startY) && guard < guardLimit);

    if (outline.length < 3) {
      return null;
    }

    return this.simplifyOutline(outline);
  }

  private simplifyOutline(points: Array<{ x: number; y: number }>, maxPoints = 240): Array<{ x: number; y: number }> {
    if (points.length <= maxPoints) {
      return points;
    }
    const step = Math.max(1, Math.floor(points.length / maxPoints));
    const simplified: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i]);
    }
    const lastPoint = points[points.length - 1];
    const lastSimplified = simplified[simplified.length - 1];
    if (!lastSimplified || lastSimplified.x !== lastPoint.x || lastSimplified.y !== lastPoint.y) {
      simplified.push(lastPoint);
    }
    return simplified;
  }

  private buildClipPath(points: Array<{ x: number; y: number }>, width: number, height: number, rotate90 = false): string | null {
    if (!points.length) return null;
    const commands: string[] = [];
    const targetWidth = rotate90 ? height : width;
    const targetHeight = rotate90 ? width : height;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const baseX = point.x + 0.5;
      const baseY = point.y + 0.5;
      const adjustedX = rotate90 ? height - baseY : baseX;
      const adjustedY = rotate90 ? baseX : baseY;
      const xPercent = (adjustedX / targetWidth) * 100;
      const yPercent = (adjustedY / targetHeight) * 100;
      commands.push(`${i === 0 ? 'M' : 'L'} ${xPercent.toFixed(2)}% ${yPercent.toFixed(2)}%`);
    }
    commands.push('Z');
    return `path("${commands.join(' ')}")`;
  }

  private setCartFeedback(type: 'success' | 'error', message: string) {
    this.cartFeedback = { type, message };
    if (this.cartFeedbackTimer) {
      clearTimeout(this.cartFeedbackTimer);
    }
    this.cartFeedbackTimer = setTimeout(() => {
      this.cartFeedback = null;
    }, 4000);
  }
}





