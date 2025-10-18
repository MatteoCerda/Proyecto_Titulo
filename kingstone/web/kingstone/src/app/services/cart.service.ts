import { Injectable, computed, effect, signal } from '@angular/core';

export interface CartProduct {
  id: number;
  name: string;
  price: number;
  quantity: number;
  itemType?: string;
  color?: string;
  provider?: string;
  imageUrl?: string | null;
}

export interface QuoteItemSummary {
  name: string;
  quantity: number;
  widthCm: number;
  heightCm: number;
}

export interface CartQuote {
  materialId: string;
  materialLabel: string;
  totalPrice: number;
  usedHeight: number;
  note?: string;
  items: QuoteItemSummary[];
  createdAt: string;
}

interface CartState {
  products: CartProduct[];
  quote: CartQuote | null;
}

const STORAGE_KEY = 'kingstone-cart-v1';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly stateSignal = signal<CartState>(this.loadInitialState());

  readonly products = computed(() => this.stateSignal().products);
  readonly quote = computed(() => this.stateSignal().quote);
  readonly productCount = computed(() =>
    this.stateSignal().products.reduce((acc, item) => acc + item.quantity, 0)
  );
  readonly totalItems = computed(() => this.productCount() + (this.quote() ? 1 : 0));
  readonly totalAmount = computed(() => {
    const catalog = this.stateSignal().products.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const quote = this.stateSignal().quote?.totalPrice ?? 0;
    return catalog + quote;
  });

  constructor() {
    effect(() => {
      this.persistState(this.stateSignal());
    });
  }

  addProduct(product: Omit<CartProduct, 'quantity'>, quantity = 1) {
    if (quantity <= 0) return;
    this.stateSignal.update(state => {
      const existingIndex = state.products.findIndex(p => p.id === product.id);
      if (existingIndex >= 0) {
        const updated = [...state.products];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity
        };
        return { ...state, products: updated };
      }
      return {
        ...state,
        products: [
          ...state.products,
          { ...product, quantity }
        ]
      };
    });
  }

  updateProductQuantity(id: number, quantity: number) {
    this.stateSignal.update(state => {
      const updated = state.products
        .map(item => item.id === id ? { ...item, quantity } : item)
        .filter(item => item.quantity > 0);
      return { ...state, products: updated };
    });
  }

  removeProduct(id: number) {
    this.stateSignal.update(state => ({
      ...state,
      products: state.products.filter(item => item.id !== id)
    }));
  }

  setQuote(quote: CartQuote | null) {
    this.stateSignal.update(state => ({
      ...state,
      quote: quote ? { ...quote } : null
    }));
  }

  clearQuote() {
    this.setQuote(null);
  }

  clearProducts() {
    this.stateSignal.update(state => ({
      ...state,
      products: []
    }));
  }

  clearAll() {
    this.stateSignal.set({ products: [], quote: null });
  }

  private loadInitialState(): CartState {
    if (typeof window === 'undefined') {
      return { products: [], quote: null };
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { products: [], quote: null };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return { products: [], quote: null };
      }
      const products = Array.isArray(parsed.products) ? parsed.products.filter(this.isCartProduct) : [];
      const quote = this.isCartQuote(parsed.quote) ? parsed.quote : null;
      return { products, quote };
    } catch {
      return { products: [], quote: null };
    }
  }

  private persistState(state: CartState) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('No se pudo guardar el carrito en localStorage', error);
    }
  }

  private isCartProduct(value: any): value is CartProduct {
    if (!value || typeof value !== 'object') return false;
    return typeof value.id === 'number' &&
      typeof value.name === 'string' &&
      typeof value.price === 'number' &&
      typeof value.quantity === 'number';
  }

  private isCartQuote(value: any): value is CartQuote {
    if (!value || typeof value !== 'object') return false;
    return typeof value.materialId === 'string' &&
      typeof value.materialLabel === 'string' &&
      typeof value.totalPrice === 'number' &&
      typeof value.usedHeight === 'number' &&
      Array.isArray(value.items);
  }
}
