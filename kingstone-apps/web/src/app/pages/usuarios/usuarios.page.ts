import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { JsonPipe, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../api.service';

type Usuario = { id: number; email: string; nombre: string; createdAt: string };

@Component({
  selector: 'app-usuarios-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    JsonPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatTableModule,
  ],
  templateUrl: './usuarios.page.html',
  styleUrl: './usuarios.page.scss',
})
export class UsuariosPage implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);

  loading = signal(false);
  usuarios: Usuario[] = [];
  displayedColumns = ['id', 'email', 'nombre', 'createdAt'];

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async ngOnInit() {
    await this.cargar();
  }

  get f() { return this.form.controls; }

  async registrar() {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    try {
      const { email, nombre, password } = this.form.getRawValue();
      await this.api.crearUsuario({ email: email!, nombre: nombre!, password: password! });
      this.snack.open('✅ Usuario creado', 'OK', { duration: 2500 });
      this.form.reset();
      await this.cargar();
    } catch (e: any) {
      const msg = (e?.message || '').includes('Email ya registrado') ? 'El email ya está registrado' : (e?.message || 'Error al crear');
      this.snack.open(`⚠️ ${msg}`, 'Cerrar', { duration: 3000 });
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  async cargar() {
    try {
      this.usuarios = await this.api.listarUsuarios();
    } catch (e) {
      this.snack.open('⚠️ Error al listar usuarios', 'Cerrar', { duration: 3000 });
      console.error(e);
    }
  }
}
