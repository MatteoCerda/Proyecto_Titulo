import { Component, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';

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
}

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  previewUrl: string | null;
}

interface ProcessedImage {
  url: string;
  aspectRatio: number;
}

type SizeMode = 'width' | 'height' | 'custom';

interface PackResult {
  placements: Placement[];
  usedHeight: number;
}

@Component({
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule],
  templateUrl: './nuevo-pedido.page.html',
  styleUrls: ['./nuevo-pedido.page.css']
})
export class NuevoPedidoPage implements OnDestroy {
  private nextId = 1;
  private readonly packGap = 0.35;

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
  priceOverride = signal<number | null>(null);

  priceDraft = this.materials[0]?.pricePerMeter.toString() ?? '';
  priceError: string | null = null;

  currentMaterial = computed(() => this.materials.find(m => m.id === this.selectedMaterialId) ?? null);

  materialDescription = computed(() => this.currentMaterial()?.description ?? '');

  private packResult = computed<PackResult>(() => {
    const material = this.currentMaterial();
    if (!material) return { placements: [], usedHeight: 0 };
    const rollWidth = material.rollWidthCm || 1;
    const rollHeight = 100;
    const gap = this.packGap;

    const pieces = this.items().reduce<Array<{ width: number; height: number; previewUrl: string | null }>>((acc, item: DesignItem) => {
      const dims = this.getEffectiveDimensions(item);
      const copies = Array.from({ length: item.quantity }, () => ({
        width: dims.width,
        height: dims.height,
        previewUrl: item.previewUrl
      }));
      acc.push(...copies);
      return acc;
    }, []);

    return this.packPieces(rollWidth, rollHeight, pieces, gap);
  });

  placements = computed<Placement[]>(() => this.packResult().placements);

  columnOptions = computed(() => {
    const material = this.currentMaterial();
    if (!material) return [];
    const maxWidth = material.rollWidthCm || 1;
    const maxColumns = Math.min(8, Math.floor(maxWidth / (5 + this.packGap)));
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
      previewUrl: cell.previewUrl
    }));
  });

  totalPrice = computed(() => {
    const material = this.currentMaterial();
    if (!material) return 0;
    const usedHeight = this.packResult().usedHeight;
    const proportion = Math.max(0.2, usedHeight / 100);
    const pricePerMeter = this.priceOverride() ?? material.pricePerMeter;
    return Math.round(pricePerMeter * proportion);
  });

  onDragOver(event: DragEvent) {
    event.preventDefault();
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
        sizeMode: 'width'
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
      sizeMode: 'width'
    };
    return this.withWidth(fallback, fallback.sizeCm);
  }

  private makeTransparentPreview(file: File): Promise<ProcessedImage | null> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(reader.result ? { url: reader.result as string, aspectRatio: img.width / img.height || 1 } : null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const { width, height } = canvas;

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

          const [avgR, avgG, avgB] = samples.reduce(
            (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
            [0, 0, 0]
          ).map(channel => channel / samples.length) as [number, number, number];
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
              (r - avgR) * (r - avgR) +
              (g - avgG) * (g - avgG) +
              (b - avgB) * (b - avgB)
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
            resolve({ url: canvas.toDataURL('image/png'), aspectRatio: 1 });
            return;
          }

          const trimmedWidth = maxX - minX + 1;
          const trimmedHeight = maxY - minY + 1;
          const trimmed = document.createElement('canvas');
          trimmed.width = trimmedWidth;
          trimmed.height = trimmedHeight;
          const trimmedCtx = trimmed.getContext('2d');
          if (!trimmedCtx) {
            resolve({ url: canvas.toDataURL('image/png'), aspectRatio: trimmedWidth / trimmedHeight || 1 });
            return;
          }
          trimmedCtx.putImageData(imageData, -minX, -minY);
          const trimmedData = trimmedCtx.getImageData(0, 0, trimmedWidth, trimmedHeight);
          const tData = trimmedData.data;
          const pad = Math.max(1, Math.floor(Math.max(trimmedWidth, trimmedHeight) * 0.02));
          for (let py = 0; py < trimmedHeight; py++) {
            for (let px = 0; px < trimmedWidth; px++) {
              if (px < pad || px >= trimmedWidth - pad || py < pad || py >= trimmedHeight - pad) {
                tData[(py * trimmedWidth + px) * 4 + 3] = 0;
              }
            }
          }
          trimmedCtx.putImageData(trimmedData, 0, 0);
          resolve({ url: trimmed.toDataURL('image/png'), aspectRatio: trimmedWidth / trimmedHeight || 1 });
        };
        img.onerror = () => resolve(reader.result ? { url: reader.result as string, aspectRatio: 1 } : null);
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
    this.priceOverride.set(null);
    this.priceError = null;
    this.priceDraft = material ? material.pricePerMeter.toString() : '';
    this.items.update(curr => curr.map(item => this.clampToMaterial(item, material)));
  }

  applyPriceOverride() {
    const parsed = this.parseNumber(this.priceDraft);
    if (parsed === null || parsed <= 0) {
      this.priceError = 'Ingresa un precio valido.';
      return;
    }
    const sanitized = Math.round(parsed);
    this.priceOverride.set(sanitized);
    this.priceDraft = sanitized.toString();
    this.priceError = null;
  }

  clearPriceOverride() {
    const material = this.currentMaterial();
    this.priceOverride.set(null);
    this.priceError = null;
    this.priceDraft = material ? material.pricePerMeter.toString() : '';
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
    const gap = this.packGap;
    const available = material.rollWidthCm - columns * gap;
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
    this.items().forEach(item => {
      if (item.previewUrl && item.revokeOnDestroy) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }

  private clampToMaterial(item: DesignItem, material: MaterialPreset | null): DesignItem {
    if (!material) return item;
    const maxWidth = Math.max(5, material.rollWidthCm - this.packGap);
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

  private packPieces(rollWidth: number, rollHeight: number, pieces: Array<{ width: number; height: number; previewUrl: string | null }>, gap: number): PackResult {
    const sorted = [...pieces].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
    const freeRects: Array<{ x: number; y: number; width: number; height: number }> = [{ x: 0, y: 0, width: rollWidth, height: rollHeight }];
    const placements: Placement[] = [];
    let canvasHeight = rollHeight;
    let maxUsedHeight = 0;

    const addFreeRect = (rect: { x: number; y: number; width: number; height: number }) => {
      if (rect.width <= 0.05 || rect.height <= 0.05) return;
      freeRects.push(rect);
    };

    const prune = () => {
      for (let i = 0; i < freeRects.length; i++) {
        for (let j = 0; j < freeRects.length; j++) {
          if (i === j) continue;
          const a = freeRects[i];
          const b = freeRects[j];
          if (a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height) {
            freeRects.splice(i, 1);
            i--;
            break;
          }
        }
      }
    };

    for (const piece of sorted) {
      let placed = false;
      let attempts = 0;
      const orientations = [
        { width: piece.width, height: piece.height },
        { width: piece.height, height: piece.width }
      ];
      const canFitWidth = orientations.some(orientation => orientation.width + gap <= rollWidth + 1e-6);
      if (!canFitWidth) {
        continue;
      }

      while (!placed && attempts < 50) {
        attempts++;
        let bestIndex = -1;
        let bestTop = Number.POSITIVE_INFINITY;
        let bestLeft = Number.POSITIVE_INFINITY;
        let bestWaste = Number.POSITIVE_INFINITY;
        let bestOrientation: { width: number; height: number } | null = null;

        for (let index = 0; index < freeRects.length; index++) {
          const rect = freeRects[index];

          for (const orientation of orientations) {
            const neededWidth = orientation.width + gap;
            const neededHeight = orientation.height + gap;
            if (neededWidth <= rect.width + 1e-6 && neededHeight <= rect.height + 1e-6) {
              const top = rect.y;
              const left = rect.x;
              const waste = rect.width * rect.height - neededWidth * neededHeight;
              const isBetterTop = top < bestTop - 1e-6;
              const isSameTop = Math.abs(top - bestTop) < 1e-6;
              const isBetterLeft = left < bestLeft - 1e-6;
              const isSameLeft = Math.abs(left - bestLeft) < 1e-6;
              const shouldUse =
                isBetterTop ||
                (isSameTop && (isBetterLeft || (isSameLeft && waste < bestWaste - 1e-6)));
              if (shouldUse) {
                bestTop = top;
                bestLeft = left;
                bestWaste = waste;
                bestIndex = index;
                bestOrientation = orientation;
              }
            }
          }
        }

        if (bestIndex === -1 || !bestOrientation) {
          const extensionHeight = Math.max(piece.height + gap, 2);
          freeRects.push({ x: 0, y: canvasHeight, width: rollWidth, height: extensionHeight });
          canvasHeight += extensionHeight;
          prune();
          continue;
        }

        const rect = freeRects.splice(bestIndex, 1)[0];
        const orientation = bestOrientation;
        const usedWidth = orientation.width + gap;
        const usedHeight = orientation.height + gap;

        placements.push({
          x: rect.x + gap / 2,
          y: rect.y + gap / 2,
          width: orientation.width,
          height: orientation.height,
          previewUrl: piece.previewUrl
        });

      const rightWidth = rect.width - usedWidth;
      const bottomHeight = rect.height - usedHeight;

      if (rightWidth > 0.1) {
        addFreeRect({ x: rect.x + usedWidth, y: rect.y, width: rightWidth, height: rect.height });
      }
      if (bottomHeight > 0.1) {
        addFreeRect({ x: rect.x, y: rect.y + usedHeight, width: usedWidth, height: bottomHeight });
      }

      maxUsedHeight = Math.max(maxUsedHeight, rect.y + usedHeight);
      prune();
      freeRects.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
      placed = true;
    }
  }

    return { placements, usedHeight: maxUsedHeight };
  }
}
