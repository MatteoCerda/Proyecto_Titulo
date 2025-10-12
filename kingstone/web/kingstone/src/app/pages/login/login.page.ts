import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg } from '@ionic/angular/standalone';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

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
      this.router.navigateByUrl('/redir', { replaceUrl: true });
    } finally {
      this.loading.set(false);
    }
  }

  entrarComoInvitado() {
    this.router.navigateByUrl('/inicio', { replaceUrl: true });
  }
}
