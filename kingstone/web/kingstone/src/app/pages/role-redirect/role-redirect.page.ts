import { Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  standalone: true,
  imports: [IonContent],
  template: `<ion-content class="ion-padding">Redirigiendo…</ion-content>`
})
export class RoleRedirectPage {
  private router = inject(Router);
  private auth = inject(AuthService);
  ngOnInit() {
    const r = this.auth.role;
    if (r === 'ADMIN' || r === 'OPERATOR') this.router.navigateByUrl('/admin', { replaceUrl: true });
    else if (r === 'CLIENT') this.router.navigateByUrl('/cliente', { replaceUrl: true });
    else this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
