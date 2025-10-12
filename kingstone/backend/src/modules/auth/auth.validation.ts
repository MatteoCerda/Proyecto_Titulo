import { z } from 'zod';

const register = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2)
});

const login = z.object({ email: z.string().email(), password: z.string().min(1) });
const forgot = z.object({ email: z.string().email() });
const reset = z.object({ token: z.string().min(10), password: z.string().min(6) });

export function validate(kind: 'register'|'login'|'forgot'|'reset', data: any) {
  switch (kind) {
    case 'register': return register.parse(data);
    case 'login': return login.parse(data);
    case 'forgot': return forgot.parse(data);
    case 'reset': return reset.parse(data);
  }
}

