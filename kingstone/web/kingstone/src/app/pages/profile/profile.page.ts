import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonList } from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth.service';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [IonContent, IonItem, IonLabel, IonInput, IonButton, IonList, ReactiveFormsModule],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss']
})
export class ProfilePage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastController);
  private router = inject(Router);

  loading = signal(false);
  form = this.fb.group({
    email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
    fullName: ['', [Validators.required, Validators.minLength(2)]],
  });
  clientForm = this.fb.group({
    rut: [''],
    nombre_contacto: [''],
    telefono: [''],
    direccion: [''],
    comuna: [''],
    ciudad: [''],
  });
  passForm = this.fb.group({
    currentPassword: ['', [Validators.required, Validators.minLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmNewPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  async ngOnInit() {
    this.loading.set(true);
    try {
      const me = await this.auth.getMe();
      this.form.patchValue({ email: me?.email || this.auth.getEmail(), fullName: me?.fullName || '' });
      const profile = await this.auth.getClientProfile();
      if (profile) {
        this.clientForm.patchValue({
          rut: profile.rut || '',
          nombre_contacto: profile.nombre_contacto || this.form.value.fullName || '',
          telefono: profile.telefono || '',
          direccion: profile.direccion || '',
          comuna: profile.comuna || '',
          ciudad: profile.ciudad || '',
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { fullName } = this.form.getRawValue();
      await this.auth.updateProfile(fullName!);
      const profile = this.clientForm.value;
      await this.auth.updateClientProfile({
        rut: profile.rut || undefined,
        // Si no especifica nombre de contacto, usamos el nombre completo
        nombre_contacto: (profile.nombre_contacto && profile.nombre_contacto.trim().length > 0)
          ? profile.nombre_contacto
          : (fullName || undefined),
        telefono: profile.telefono || undefined,
        direccion: profile.direccion || undefined,
        comuna: profile.comuna || undefined,
        ciudad: profile.ciudad || undefined,
      });
      const t = await this.toast.create({
        message: 'Perfil actualizado',
        duration: 2000,
        position: 'top',
        color: 'success'
      });
      await t.present();
    } catch (e: any) {
      const msg = e?.error?.message || 'No se pudieron actualizar los datos';
      const t = await this.toast.create({ message: msg, duration: 2500, position: 'top', color: 'danger' });
      await t.present();
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmitPassword() {
    if (this.passForm.invalid) return;
    const { currentPassword, newPassword, confirmNewPassword } = this.passForm.value;
    if (newPassword !== confirmNewPassword) {
      const t = await this.toast.create({ message: 'Las contraseñas no coinciden', duration: 2000, position: 'top', color: 'warning' });
      await t.present();
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.updatePassword(currentPassword!, newPassword!);
      const t = await this.toast.create({ message: 'Contraseña actualizada', duration: 2000, position: 'top', color: 'success' });
      await t.present();
      this.passForm.reset();
    } catch (e: any) {
      const msg = e?.error?.message || 'No se pudo actualizar la contraseña';
      const t = await this.toast.create({ message: msg, duration: 2500, position: 'top', color: 'danger' });
      await t.present();
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
