import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonItem, IonLabel, IonInput, IonButton } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [IonContent, IonItem, IonLabel, IonInput, IonButton, ReactiveFormsModule, RouterLink],
  template: `
  <ion-content class="forgot">
    <div class="box">
      <h1 class="title">Recuperar contraseña</h1>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <ion-item>
          <ion-label position="stacked">Correo electrónico</ion-label>
          <ion-input type="email" formControlName="email"></ion-input>
        </ion-item>
        <ion-button expand="block" class="ion-margin-top" [disabled]="form.invalid || sending()" type="submit">
          Enviar instrucciones
        </ion-button>
        <ion-button routerLink="/login" fill="clear" expand="block">Volver al inicio de sesión</ion-button>
      </form>
    </div>
  </ion-content>
  `,
  styleUrls: ['./forgot-password.page.scss']
})
export class ForgotPasswordPage {
  private fb = inject(FormBuilder);
  sending = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async onSubmit() {
    if (this.form.invalid) return;
    this.sending.set(true);
    // TODO: integrar con backend para enviar correo de recuperación
    setTimeout(() => this.sending.set(false), 800);
  }
}
