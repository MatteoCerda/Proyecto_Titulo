import { CanMatchFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const roleGuard = (...roles: string[]): CanMatchFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const current = auth.getRole();
  const required = roles.length ? roles.map(r => r.toUpperCase()) : ['CLIENT'];
  if (required.includes(current)) {
    return true;
  }

  const redirect = required.includes('ADMIN')
    ? '/admin/login'
    : required.includes('OPERATOR')
      ? '/operador/login'
      : '/login';

  return router.createUrlTree([redirect]);
};
