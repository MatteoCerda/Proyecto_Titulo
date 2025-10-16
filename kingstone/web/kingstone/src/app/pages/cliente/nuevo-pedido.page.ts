import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg } from '@ionic/angular/standalone';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { UploadsService } from '../../services/uploads.service';

@Component({
  standalone: true,
  imports: [CommonModule, IonContent, IonItem, IonLabel, IonInput, IonButton, IonImg, ReactiveFormsModule],
  template: `
  <ion-content class="ion-padding">
    <h2>Nuevo pedido</h2>

    <!-- Archivo (PNG/JPG/PDF) -->
    <input type="file" accept=".png,.jpg,.jpeg,.pdf" (change)="onFile($event)"/>

    <div *ngIf="previewUrl()" class="prev">
      <ion-img *ngIf="isImage()" [src]="previewUrl()"></ion-img>
      <p *ngIf="!isImage()">Archivo seleccionado: {{file()?.name}}</p>
    </div>

    <ion-item>
      <ion-label position="stacked">Notas</ion-label>
      <ion-input [value]="notes()" (ionInput)="notes.set($any($event.target).value)"></ion-input>
    </ion-item>

    <ion-button class="ion-margin-top" (click)="enviar()" [disabled]="!file()">Enviar</ion-button>
  </ion-content>
  `,
  styles: [`.prev{margin:16px 0}.prev ion-img{max-width:320px;}`]
})
export class NuevoPedidoPage {
  private fb = inject(FormBuilder);
  private uploads = inject(UploadsService);

  file = signal<File|undefined>(undefined);
  previewUrl = signal<string|undefined>(undefined);
  notes = signal('');

  onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.file.set(f);
    // preview solo si imagen
    if (f.type.startsWith('image/')) {
      this.previewUrl.set(URL.createObjectURL(f));
    } else {
      this.previewUrl.set(undefined);
    }
  }

  isImage() { return !!this.file() && this.file()!.type.startsWith('image/'); }

  async enviar() {
    if (!this.file()) return;
    await this.uploads.uploadDesign(this.file()!, { notes: this.notes() }).toPromise();
    alert('Pedido enviado');
    this.file.set(undefined);
    this.previewUrl.set(undefined);
    this.notes.set('');
  }
}
