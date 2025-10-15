import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class RegisterPage {
  fullName = '';
  email = '';
  password = '';
  // Campos de perfil
  rut = '';
  nombre_contacto = '';
  telefono = '';
  direccion = '';
  comuna = '';
  ciudad = '';
  loading = false;

  private toast = inject(ToastController);

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit() {
    if (!this.fullName || !this.email || !this.password) return;
    this.loading = true;
    const extra = {
      rut: this.rut || undefined,
      nombre_contacto: this.nombre_contacto || this.fullName,
      telefono: this.telefono || undefined,
      direccion: this.direccion || undefined,
      comuna: this.comuna || undefined,
      ciudad: this.ciudad || undefined,
    };
    this.auth.register(this.fullName, this.email, this.password, extra).subscribe({
      next: async () => {
        // Burbuja por creación de usuario
        const t = await this.toast.create({
          message: 'Haz creado usuario existosamente',
          duration: 2000,
          position: 'top',
          color: 'success'
        });
        await t.present();

        // Tras registrar, inicia sesión automáticamente y va a /inicio
        this.auth.login(this.email, this.password).subscribe({
          next: () => { this.loading = false; this.router.navigateByUrl('/inicio'); },
          error: () => { this.loading = false; alert('Error al iniciar sesión tras registro'); }
        });
      },
      error: (e) => {
        this.loading = false;
        alert(e?.error?.message || 'No se pudo registrar (¿correo ya registrado?)');
      }
    });
  }

  goLogin() {
    this.router.navigateByUrl('/login');
  }
}

