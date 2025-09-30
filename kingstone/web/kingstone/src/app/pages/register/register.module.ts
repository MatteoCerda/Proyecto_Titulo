import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RegisterPage } from './register.page';

@NgModule({
  imports: [
    RegisterPage,
    RouterModule.forChild([{ path: '', component: RegisterPage }]),
  ],
})
export class RegisterPageModule {}
