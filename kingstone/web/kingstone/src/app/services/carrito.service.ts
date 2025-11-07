
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CarritoService {
  private productosEnCarrito = new BehaviorSubject<any[]>([]);
  public productosEnCarrito$ = this.productosEnCarrito.asObservable();

  constructor() { }

  agregarProducto(producto: any) {
    const productosActuales = this.productosEnCarrito.getValue();
    const nuevosProductos = [...productosActuales, producto];
    this.productosEnCarrito.next(nuevosProductos);
  }

  eliminarProducto(idProducto: any) {
    const productosActuales = this.productosEnCarrito.getValue();
    const nuevosProductos = productosActuales.filter(p => p.id !== idProducto);
    this.productosEnCarrito.next(nuevosProductos);
  }

  limpiarCarrito() {
    this.productosEnCarrito.next([]);
  }
}
