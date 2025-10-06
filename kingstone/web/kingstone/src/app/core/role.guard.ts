import { CanMatchFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService, UserRole } from './auth.service';

export function roleGuard(roles: UserRole[]): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.hasRole(roles) ? true : router.createUrlTree(['/forbidden']);
  };
}
