import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-nosotros',
  imports: [CommonModule, IonContent],
  templateUrl: './nosotros.page.html',
  styleUrls: ['./nosotros.page.scss']
})
export class NosotrosPage {}
