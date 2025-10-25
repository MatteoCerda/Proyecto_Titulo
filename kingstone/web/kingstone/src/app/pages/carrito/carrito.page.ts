import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CartService } from '../../services/cart.service';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, removeOutline, cartOutline, closeOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PedidosService, CartPedidoRequest } from '../../services/pedidos.service';

addIcons({ trashOutline, addOutline, removeOutline, cartOutline, closeOutline });

@Component({
  standalone: true,
  selector: 'app-carrito',
  imports: [
    CommonModule,
    CurrencyPipe,
    DatePipe,
    IonContent,
    IonButton,
    IonIcon,
  RouterLink
  ],
  templateUrl: './carrito.page.html',
  styleUrls: ['./carrito.page.scss']
})
export class CarritoPage {
  private readonly cart = inject(CartService);
  private readonly pedidos = inject(PedidosService);

  readonly products = this.cart.products;
  readonly quote = this.cart.quote;
  readonly total = this.cart.totalAmount;
  readonly hasItems = computed(() => this.products().length > 0 || !!this.quote());
  readonly submitting = signal(false);
  readonly requestFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  increment(productId: number) {
    const current = this.products().find(p => p.id === productId);
    if (!current) return;
    this.cart.updateProductQuantity(productId, current.quantity + 1);
  }

  decrement(productId: number) {
    const current = this.products().find(p => p.id === productId);
    if (!current) return;
    const next = current.quantity - 1;
    if (next <= 0) {
      this.cart.removeProduct(productId);
    } else {
      this.cart.updateProductQuantity(productId, next);
    }
  }

  removeProduct(productId: number) {
    this.cart.removeProduct(productId);
  }

  clearQuote() {
    this.cart.clearQuote();
  }

  clearCart() {
    this.cart.clearAll();
  }

  async submitOrder() {
    if (!this.hasItems()) {
      return;
    }
    if (this.submitting()) {
      return;
    }

    this.requestFeedback.set(null);
    this.submitting.set(true);

    const productsPayload = this.products().map(product => ({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      itemType: product.itemType,
      color: product.color,
      provider: product.provider,
      imageUrl: product.imageUrl ?? null
    }));

    const quote = this.quote();
    const quotePayload = quote
      ? {
          materialId: quote.materialId,
          materialLabel: quote.materialLabel,
          totalPrice: quote.totalPrice,
          usedHeight: quote.usedHeight,
          note: quote.note,
          items: quote.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            widthCm: item.widthCm,
            heightCm: item.heightCm
          })),
          createdAt: quote.createdAt
        }
      : undefined;

    const payload: CartPedidoRequest = {
      source: 'cart',
      products: productsPayload,
      quote: quotePayload,
      note: quote?.note ?? undefined
    };

    try {
      await firstValueFrom(this.pedidos.submitPedidoFromCart(payload));
      this.requestFeedback.set({
        type: 'success',
        message: 'Tu solicitud fue enviada. La revisaremos durante el dia.'
      });
      this.cart.clearAll();
    } catch (error) {
      console.error('Error enviando pedido desde carrito', error);
      const status = (error as any)?.status;
      const message = status === 401
        ? 'Debes iniciar sesión para enviar tu pedido.'
        : 'No pudimos enviar la solicitud. Inténtalo nuevamente.';
      this.requestFeedback.set({
        type: 'error',
        message
      });
    } finally {
      this.submitting.set(false);
    }
  }
}
