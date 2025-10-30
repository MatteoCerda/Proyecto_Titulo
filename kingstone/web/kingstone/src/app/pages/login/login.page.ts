import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg } from '@ionic/angular/standalone';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastController } from '@ionic/angular';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg, ReactiveFormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);

  loading = signal(false);
  showPassword = false;
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  scope: 'client' | 'admin' | 'operator' = 'client';
  title = 'Iniciar sesion';
  showRegister = true;
  showGuest = true;
  showForgot = true;

  constructor() {
    const dataScope = this.route.snapshot.data?.['scope'];
    if (dataScope === 'admin' || dataScope === 'operator') {
      this.scope = dataScope;
    }
    if (this.scope === 'admin') {
      this.title = 'Acceso administracion';
      this.showRegister = false;
      this.showGuest = false;
    } else if (this.scope === 'operator') {
      this.title = 'Acceso operador';
      this.showRegister = false;
      this.showGuest = false;
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { email, password } = this.form.value;
      await this.auth.login(email!, password!, this.scope);
      // Mostrar burbuja de mensaje
      const t = await this.toast.create({
        message: 'Haz iniciado sesion',
        duration: 2000,
        position: 'top',
        color: 'success'
      });
      await t.present();
      // Redirigir por rol
      const role = this.auth.getRole();
      let target = '/cliente';
      if (role === 'ADMIN') {
        target = '/admin/inicio';
      } else if (role === 'OPERATOR') {
        target = '/operador/solicitudes';
      }
      this.router.navigateByUrl(target, { replaceUrl: true });
    } catch (e: any) {
      const status = e?.status;
      let msg = e?.error?.message || 'No se pudo iniciar sesion';
      if (status === 401) {
        msg = 'Correo o contrasena incorrectos';
      } else if (status === 403) {
        msg = 'No tienes permisos para este portal';
      }
      const t = await this.toast.create({ message: msg, duration: 2500, position: 'top', color: 'danger' });
      await t.present();
    } finally {
      this.loading.set(false);
    }
  }

  entrarComoInvitado() {
    this.router.navigateByUrl('/inicio', { replaceUrl: true });
  }
}

