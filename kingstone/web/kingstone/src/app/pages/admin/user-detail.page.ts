import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonList, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';

@Component({
  standalone: true,
  selector: 'app-admin-user-detail',
  imports: [CommonModule, ReactiveFormsModule, IonContent, IonItem, IonLabel, IonInput, IonButton, IonList, IonSelect, IonSelectOption],
  template: `
  <ion-content class="ion-padding">
    <h1>Usuario</h1>
    <form [formGroup]="form" (ngSubmit)="onSave()">
      <ion-list lines="full">
        <ion-item><ion-label position="stacked">Email</ion-label><ion-input formControlName="email" readonly></ion-input></ion-item>
        <ion-item><ion-label position="stacked">Nombre completo</ion-label><ion-input formControlName="fullName"></ion-input></ion-item>
        <ion-item>
          <ion-label position="stacked">Rol</ion-label>
          <ion-select formControlName="role">
            <ion-select-option value="user">Cliente</ion-select-option>
            <ion-select-option value="admin">Administrador</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item><ion-label position="stacked">RUT</ion-label><ion-input formControlName="rut"></ion-input></ion-item>
        <ion-item><ion-label position="stacked">Teléfono</ion-label><ion-input formControlName="telefono"></ion-input></ion-item>
        <ion-item><ion-label position="stacked">Dirección</ion-label><ion-input formControlName="direccion"></ion-input></ion-item>
        <ion-item><ion-label position="stacked">Comuna</ion-label><ion-input formControlName="comuna"></ion-input></ion-item>
        <ion-item><ion-label position="stacked">Ciudad</ion-label><ion-input formControlName="ciudad"></ion-input></ion-item>
      </ion-list>
      <ion-button expand="block" type="submit" [disabled]="loading()">Guardar</ion-button>
      <ion-button expand="block" color="medium" fill="outline" (click)="back()">Volver</ion-button>
    </form>
  </ion-content>
  `
})
export class AdminUserDetailPage {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private api = 'http://localhost:3000';

  id = Number(this.route.snapshot.paramMap.get('id'));
  loading = signal(false);
  form = this.fb.group({
    email: [''],
    fullName: [''],
    role: ['user'],
    rut: [''],
    telefono: [''],
    direccion: [''],
    comuna: [''],
    ciudad: [''],
  });

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.http.get<any>(`${this.api}/admin/users/${this.id}`).subscribe(u => {
      this.form.patchValue({
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        rut: u.cliente?.rut || '',
        telefono: u.cliente?.telefono || '',
        direccion: u.cliente?.direccion || '',
        comuna: u.cliente?.comuna || '',
        ciudad: u.cliente?.ciudad || '',
      });
      this.loading.set(false);
    });
  }

  onSave() {
    const v = this.form.getRawValue();
    this.loading.set(true);
    this.http.patch(`${this.api}/admin/users/${this.id}`, {
      fullName: v.fullName,
      role: v.role,
      perfil: { rut: v.rut || null, telefono: v.telefono || null, direccion: v.direccion || null, comuna: v.comuna || null, ciudad: v.ciudad || null }
    }).subscribe({ next: () => { this.loading.set(false); this.back(); }, error: () => this.loading.set(false) });
  }

  back() { this.router.navigateByUrl('/admin/usuarios'); }
}

