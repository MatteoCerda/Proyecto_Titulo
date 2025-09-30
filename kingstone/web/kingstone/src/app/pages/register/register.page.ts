import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
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
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit() {
    if (!this.fullName || !this.email || !this.password) return;
    this.loading = true;
    this.auth.register(this.fullName, this.email, this.password).subscribe({
      next: () => {
        // tras registrar, inicia sesión automáticamente y va a /home
        this.auth.login(this.email, this.password).subscribe({
          next: () => { this.loading = false; this.router.navigateByUrl('/home'); },
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
