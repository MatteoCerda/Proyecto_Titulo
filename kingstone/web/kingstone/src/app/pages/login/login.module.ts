import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

// Módulo liviano que delega a un componente standalone
@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', loadComponent: () => import('./login.page').then(m => m.LoginPage) },
    ]),
  ],
})
export class LoginPageModule {}
