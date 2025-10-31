import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, ToastController } from '@ionic/angular/standalone';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, IonContent, IonItem, IonLabel, IonInput, IonButton, ReactiveFormsModule, RouterLink],
  template: `
  <ion-content class="forgot">
    <div class="box">
      <h1 class="title">Recuperar contraseña</h1>
      <p class="message" *ngIf="!sent()">Ingresa tu correo y te enviaremos un enlace para recuperar tu cuenta.</p>
      <p class="message success" *ngIf="sent()">¡Revisa tu correo! Te hemos enviado las instrucciones. El enlace expirará en 30 minutos.</p>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="!sent()">
        <ion-item>
          <ion-label position="stacked">Correo electrónico</ion-label>
          <ion-input type="email" formControlName="email"></ion-input>
        </ion-item>
        <ion-button expand="block" class="ion-margin-top" [disabled]="form.invalid || sending()" type="submit">
          {{ sending() ? 'Enviando...' : 'Enviar instrucciones' }}
        </ion-button>
      </form>

      <ion-button routerLink="/login" fill="clear" expand="block">Volver al inicio de sesión</ion-button>
    </div>
  </ion-content>
  `,
  styleUrls: ['./forgot-password.page.scss']
})
export class ForgotPasswordPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastController);
  private router = inject(Router);

  sending = signal(false);
  sent = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async onSubmit() {
    if (this.form.invalid) return;
    this.sending.set(true);
    try {
      const email = this.form.value.email!;
      await this.auth.forgotPassword(email);
      this.sent.set(true);
    } catch (err) {
      const toast = await this.toast.create({
        message: 'No se pudo procesar la solicitud. Intenta nuevamente.',
        duration: 3000,
        color: 'danger'
      });
      toast.present();
    } finally {
      this.sending.set(false);
    }
  }
}
