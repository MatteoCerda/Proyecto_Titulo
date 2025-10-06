import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-role-redirect',
  imports: [IonContent],
  template: `<ion-content class="ion-padding">Redirigiendo...</ion-content>`
})
export class RoleRedirectPage {
  private router = inject(Router);
  private auth = inject(AuthService);

  ngOnInit() {
    const role = this.auth.getRole();
    const path = role === 'ADMIN' ? '/admin' :
                 role === 'OPERATOR' ? '/operador' :
                 '/cliente';
    this.router.navigateByUrl(path, { replaceUrl: true });
  }
}

