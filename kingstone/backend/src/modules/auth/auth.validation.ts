import { z } from 'zod';
import type { RegisterDTO, LoginDTO } from './auth.types';

const register = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2)
});

const login = z.object({ email: z.string().email(), password: z.string().min(1) });
const forgot = z.object({ email: z.string().email() });
const reset = z.object({ token: z.string().min(10), password: z.string().min(6) });

type ValidateMap = {
  register: RegisterDTO;
  login: LoginDTO;
  forgot: { email: string };
  reset: { token: string; password: string };
};

export function validate<K extends keyof ValidateMap>(kind: K, data: any): ValidateMap[K] {
  switch (kind) {
    case 'register': return register.parse(data) as ValidateMap[K];
    case 'login': return login.parse(data) as ValidateMap[K];
    case 'forgot': return forgot.parse(data) as ValidateMap[K];
    case 'reset': return reset.parse(data) as ValidateMap[K];
  }
}

