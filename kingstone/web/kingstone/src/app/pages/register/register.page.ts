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
  fieldErrors: Partial<Record<'fullName' | 'email' | 'password' | 'rut', string>> = {};
  generalError = '';

  private toast = inject(ToastController);

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit() {
    if (!this.validateForm()) {
      this.presentToast(this.generalError || 'Corrige los errores antes de continuar');
      return;
    }
    this.loading = true;
    const extra = {
      rut: this.rut || undefined,
      nombre_contacto: (this.nombre_contacto || this.fullName).trim(),
      telefono: this.telefono?.trim() || undefined,
      direccion: this.direccion?.trim() || undefined,
      comuna: this.comuna?.trim() || undefined,
      ciudad: this.ciudad?.trim() || undefined,
    };
    const fullName = this.fullName.trim();
    const email = this.email.trim();
    const password = this.password;

    this.auth.register(fullName, email, password, extra).subscribe({
      next: async () => {
        // Burbuja por creaciÃ³n de usuario
        const t = await this.toast.create({
          message: 'Haz creado usuario existosamente',
          duration: 2000,
          position: 'top',
          color: 'success'
        });
        await t.present();

        // Tras registrar, inicia sesiÃ³n automÃ!ticamente y va a /inicio
        this.auth.login(this.email, this.password).subscribe({
          next: () => { this.loading = false; this.router.navigateByUrl('/inicio'); },
          error: () => { this.loading = false; alert('Error al iniciar sesiÃ³n tras registro'); }
        });
      },
      error: (e) => {
        this.loading = false;
        const serverMessage = e?.error?.message;
        if (serverMessage === 'Email ya registrado') {
          const message = 'El correo ingresado ya esta registrado.';
          this.fieldErrors = { email: message };
          this.generalError = '';
          this.presentToast(message);
          return;
        }
        const issues = Array.isArray(e?.error?.issues) ? e.error.issues : [];
        if (issues.length) {
          const errors: typeof this.fieldErrors = {};
          for (const issue of issues) {
            const path = Array.isArray(issue?.path) ? issue.path[0] : undefined;
            if (path && ['fullName', 'email', 'password', 'rut'].includes(path)) {
              errors[path as keyof typeof this.fieldErrors] = issue.message;
            }
          }
          this.fieldErrors = errors;
          this.generalError = Object.keys(errors).length ? '' : serverMessage || 'Corrige los errores indicados.';
          const message = this.generalError || serverMessage || 'Corrige los errores indicados.';
          this.presentToast(message);
          return;
        }
        this.fieldErrors = {};
        this.generalError = serverMessage || 'No se pudo registrar. Intentalo nuevamente.';
        this.presentToast(this.generalError);
      }
    });
  }

  goLogin() {
    this.router.navigateByUrl('/login');
  }

  private validateForm(): boolean {
    const errors: typeof this.fieldErrors = {};
    this.generalError = '';

    const fullName = this.fullName?.trim() || '';
    const email = this.email?.trim() || '';
    const password = this.password || '';
    const rutInput = this.rut?.trim() || '';

    if (!fullName) {
      errors.fullName = 'El nombre completo es obligatorio.';
    } else if (fullName.length < 2) {
      errors.fullName = 'El nombre debe tener al menos 2 caracteres.';
    }

    if (!email) {
      errors.email = 'El correo es obligatorio.';
    } else if (!this.isValidEmail(email)) {
      errors.email = 'Ingresa un correo valido.';
    }

    if (!password) {
      errors.password = 'La contrasena es obligatoria.';
    } else if (password.length < 6) {
      errors.password = 'La contrasena debe tener al menos 6 caracteres.';
    }

    if (rutInput) {
      const normalized = this.normalizeRut(rutInput);
      if (!normalized) {
        errors.rut = 'Ingresa un RUT valido.';
      } else if (!this.isValidRut(normalized.body, normalized.dv)) {
        errors.rut = 'El RUT ingresado no es valido.';
      } else {
        this.rut = this.formatRut(normalized.body, normalized.dv);
      }
    }

    this.fieldErrors = errors;
    return Object.keys(errors).length === 0;
  }

  private isValidEmail(email: string): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }

  private normalizeRut(rut: string): { body: string; dv: string } | null {
    const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (!/^\d{2,8}[0-9K]$/.test(cleaned)) return null;
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    return { body, dv };
  }

  private isValidRut(body: string, dv: string): boolean {
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const expected = 11 - (sum % 11);
    let dvCalc = '';
    if (expected === 11) dvCalc = '0';
    else if (expected === 10) dvCalc = 'K';
    else dvCalc = expected.toString();
    return dvCalc === dv;
  }

  private formatRut(body: string, dv: string): string {
    const reversed = body.split('').reverse();
    const groups: string[] = [];
    for (let i = 0; i < reversed.length; i += 3) {
      groups.push(reversed.slice(i, i + 3).reverse().join(''));
    }
    const formattedBody = groups.reverse().join('.');
    return `${formattedBody}-${dv}`;
  }

  private async presentToast(message: string) {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: 'top',
      color: 'danger'
    });
    await t.present();
  }
}





