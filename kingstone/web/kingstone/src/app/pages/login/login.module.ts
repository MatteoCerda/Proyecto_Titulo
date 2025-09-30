import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { LoginPage } from './login.page';

@NgModule({
  imports: [
    // el propio componente standalone
    LoginPage,
    // y el router para esta ruta
    RouterModule.forChild([{ path: '', component: LoginPage }]),
  ],
})
export class LoginPageModule {}
