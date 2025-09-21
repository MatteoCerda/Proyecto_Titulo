import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { JsonPipe } from '@angular/common';
import { ApiService } from './api.service';

type Usuario = { id: number; email: string; nombre: string; createdAt: string };

@Component({
  selector: 'app-root',
  standalone: true,
  // Quitamos RouterOutlet porque no se usa en el template
  imports: [FormsModule, MatToolbarModule, MatButtonModule, JsonPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private api = inject(ApiService); // preferido por lint

  email = '';
  nombre = '';
  password = '';
  usuarios: Usuario[] = [];

  async registrar(e: Event) {
    e.preventDefault();
    await this.api.crearUsuario({ email: this.email, nombre: this.nombre, password: this.password });
    this.email = this.nombre = this.password = '';
    await this.cargar();
  }

  async cargar() {
    this.usuarios = await this.api.listarUsuarios();
  }
}
