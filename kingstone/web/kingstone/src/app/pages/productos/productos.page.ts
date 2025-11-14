import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { ViewWillEnter } from '@ionic/angular';
import { CatalogService, CatalogItem } from '../../services/catalog.service';
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
export class ProductosPage implements OnInit, OnDestroy, ViewWillEnter {
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
  readonly selectedProduct = signal<CatalogItem | null>(null);
  readonly productQuantity = signal(1);
  readonly recommendedProducts = computed(() => {
    const current = this.selectedProduct();
    if (!current) return [];
    return this.items()
      .filter(item => item.id !== current.id && item.itemType === current.itemType)
      .slice(0, 4);
  });

  private readonly invalidateHandler = () => { void this.refreshCatalog(); };
  private previousBodyOverflow: string | null = null;
  private modalTimer: any = null;

  async ngOnInit() {
    const searchTerm = this.route.snapshot.queryParamMap.get('search') || '';
    this.search.set(searchTerm);
    if (typeof window !== 'undefined') {
      window.addEventListener('catalog:invalidate', this.invalidateHandler);
    }
    await this.refreshCatalog();
  }

  async ionViewWillEnter() {
    await this.refreshCatalog();
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('catalog:invalidate', this.invalidateHandler);
    }
    this.unlockBodyScroll();
    if (this.modalTimer) {
      clearTimeout(this.modalTimer);
    }
  }

  onSearch(ev: CustomEvent) {
    const value = typeof ev.detail?.value === 'string' ? ev.detail.value : '';
    this.search.set(value);
  }

  refreshCatalog() {
    const term = this.search().trim();
    return this.catalog.loadCatalog(term ? { search: term } : {}, true);
  }

  addToCart(itemId: number) {
    const item = this.catalog.items().find(p => p.id === itemId);
    if (!item) return;
    this.pushProductToCart(item, 1);
  }

  openProductDetail(product: CatalogItem) {
    this.selectedProduct.set(product);
    const initialQty = product.quantity > 0 ? 1 : 0;
    this.productQuantity.set(initialQty);
    this.lockBodyScroll();
  }

  closeProductDetail() {
    this.selectedProduct.set(null);
    this.productQuantity.set(1);
    this.unlockBodyScroll();
  }

  decreaseQuantity() {
    const product = this.selectedProduct();
    if (!product) return;
    if ((product.quantity ?? 0) <= 0) {
      return;
    }
    const next = Math.max(1, this.productQuantity() - 1);
    this.productQuantity.set(next);
  }

  increaseQuantity() {
    const product = this.selectedProduct();
    if (!product) return;
    const stock = product.quantity ?? Number.MAX_SAFE_INTEGER;
    if (stock <= 0) {
      return;
    }
    const next = Math.min(stock, this.productQuantity() + 1);
    this.productQuantity.set(next);
  }

  addDetailProductToCart() {
    const product = this.selectedProduct();
    if (!product) return;
    const stock = product.quantity ?? 0;
    if (stock <= 0) return;
    const qty = this.productQuantity();
    if (qty < 1) return;
    const safeQty = Math.min(qty, stock);
    this.pushProductToCart(product, safeQty);
    this.closeProductDetail();
  }

  private pushProductToCart(product: CatalogItem, quantity: number) {
    if (!quantity || quantity < 1) return;
    this.cart.addProduct(
      {
        id: product.id,
        name: product.name,
        price: product.price,
        itemType: product.itemType,
        color: product.color,
        provider: product.provider,
        imageUrl: product.imageUrl,
        precioOferta: product.offerPrice ?? undefined,
        precioOriginal: product.offerPrice ? product.basePrice : undefined
      },
      quantity
    );
    this.lastAddedId.set(product.id);
    if (this.modalTimer) {
      clearTimeout(this.modalTimer);
    }
    this.modalTimer = setTimeout(() => this.lastAddedId.set(null), 2000);
  }

  private lockBodyScroll() {
    if (typeof document === 'undefined') {
      return;
    }
    this.previousBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll() {
    if (typeof document === 'undefined') {
      return;
    }
    if (this.previousBodyOverflow !== null) {
      document.body.style.overflow = this.previousBodyOverflow;
    }
  }
}
