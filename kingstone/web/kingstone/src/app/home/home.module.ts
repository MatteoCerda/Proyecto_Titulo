// src/app/home/home.module.ts
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HomePage } from './home.page';

@NgModule({
  // Un componente standalone NO se declara
  // Se importa y se usa en la ruta
  imports: [
    HomePage,
    RouterModule.forChild([{ path: '', component: HomePage }]),
  ],
})
export class HomePageModule {}
