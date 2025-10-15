import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg } from '@ionic/angular/standalone';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastController } from '@ionic/angular';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg, ReactiveFormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastController);

  loading = signal(false);
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { email, password } = this.form.value;
      await this.auth.login(email!, password!);
      // Mostrar burbuja de mensaje
      const t = await this.toast.create({
        message: 'Haz iniciado sesi\u00F3n',
        duration: 2000,
        position: 'top',
        color: 'success'
      });
      await t.present();
      // Redirigir por rol
      const role = this.auth.getRole();
      const target = role === 'ADMIN' ? '/admin/inicio' : role === 'OPERATOR' ? '/operador' : '/cliente';
      this.router.navigateByUrl(target, { replaceUrl: true });
    } catch (e: any) {
      const status = e?.status;
      const msg = status === 401
        ? 'Correo o contrase\u00F1a incorrectos'
        : (e?.error?.message || 'No se pudo iniciar sesi\u00F3n');
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
