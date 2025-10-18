import { Component, computed, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CartService } from '../../services/cart.service';
import { addIcons } from 'ionicons';
import { trashOutline, addOutline, removeOutline, cartOutline, closeOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';

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

  readonly products = this.cart.products;
  readonly quote = this.cart.quote;
  readonly total = this.cart.totalAmount;
  readonly hasItems = computed(() => this.products().length > 0 || !!this.quote());

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
}
