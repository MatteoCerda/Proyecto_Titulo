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
}

@Component({
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule],
  templateUrl: './nuevo-pedido.page.html',
  styleUrls: ['./nuevo-pedido.page.css']
})
export class NuevoPedidoPage implements OnDestroy {
  private nextId = 1;

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

  readonly gridSlots = Array.from({ length: 12 }, (_, i) => i);

  materialDescription = computed(() => {
    const material = this.materials.find(m => m.id === this.selectedMaterialId);
    return material?.description ?? '';
  });

  totalPrice = computed(() => {
    const material = this.materials.find(m => m.id === this.selectedMaterialId);
    if (!material) return 0;
    const totalAreaCm2 = this.items().reduce((acc, item) => {
      const pieceArea = item.sizeCm * item.sizeCm;
      return acc + pieceArea * item.quantity;
    }, 0);
    const rollAreaCm2 = material.rollWidthCm * 100;
    if (rollAreaCm2 === 0) return 0;
    const proportion = Math.max(0.2, totalAreaCm2 / rollAreaCm2);
    return Math.round(material.pricePerMeter * proportion);
  });

  totalCopies() {
    return this.items().reduce((acc, item) => acc + item.quantity, 0);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.appendFiles(event.dataTransfer?.files);
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    this.appendFiles(input.files);
    input.value = '';
  }

  private appendFiles(fileList: FileList | null | undefined) {
    if (!fileList || fileList.length === 0) return;
    const newItems: DesignItem[] = [];
    Array.from(fileList)
      .slice(0, Math.max(0, 20 - this.items().length))
      .forEach(file => {
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        newItems.push({
          id: this.nextId++,
          file,
          previewUrl: preview,
          displayName: file.name,
          quantity: 1,
          sizeCm: 25
        });
      });
    if (newItems.length === 0) return;
    this.items.update(curr => [...curr, ...newItems]);
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
    this.items.update(curr =>
      curr.map(item =>
        item.id === id
          ? { ...item, sizeCm: Math.min(60, Math.max(10, item.sizeCm + delta)) }
          : item
      )
    );
  }

  setSize(id: number, value: number) {
    const size = Number(value) || 10;
    this.items.update(curr =>
      curr.map(item =>
        item.id === id
          ? { ...item, sizeCm: Math.min(60, Math.max(10, Math.round(size))) }
          : item
      )
    );
  }

  removeItem(id: number) {
    const removed = this.items().find(item => item.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    this.items.update(curr => curr.filter(item => item.id !== id));
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
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }
}
