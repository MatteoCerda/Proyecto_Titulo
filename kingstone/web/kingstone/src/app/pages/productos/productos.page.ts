import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonSearchbar,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonSpinner
} from '@ionic/angular/standalone';
import { CatalogService } from '../../services/catalog.service';
import { CartService } from '../../services/cart.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-productos',
  imports: [
    CommonModule,
    IonContent,
    IonSearchbar,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonSpinner
  ],
  templateUrl: './productos.page.html',
  styleUrls: ['./productos.page.scss']
})
export class ProductosPage implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);

  readonly search = signal('');
  readonly items = computed(() => {
    const items = this.catalog.items();
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return items;
    }
    return items.filter(item =>
      [item.name, item.itemType, item.color, item.provider]
        .filter(Boolean)
        .some(field => field.toLowerCase().includes(term))
    );
  });

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly lastAddedId = signal<number | null>(null);

  async ngOnInit() {
    const searchTerm = this.route.snapshot.queryParamMap.get('search') || '';
    this.search.set(searchTerm);
    await this.catalog.loadCatalog();
  }

  onSearch(ev: CustomEvent) {
    const value = typeof ev.detail?.value === 'string' ? ev.detail.value : '';
    this.search.set(value);
  }

  addToCart(itemId: number) {
    const item = this.catalog.items().find(p => p.id === itemId);
    if (!item) return;
    this.cart.addProduct(
      {
        id: item.id,
        name: item.name,
        price: item.price,
        itemType: item.itemType,
        color: item.color,
        provider: item.provider,
        imageUrl: item.imageUrl,
        precioOferta: item.offerPrice ?? undefined,
        precioOriginal: item.offerPrice ? item.basePrice : undefined
      },
      1
    );
    this.lastAddedId.set(item.id);
    setTimeout(() => this.lastAddedId.set(null), 2000);
  }
}
