import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  base = 'http://localhost:3000';

  async crearUsuario(body: { email: string; nombre: string; password: string }) {
    const r = await fetch(`${this.base}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async listarUsuarios() {
    const r = await fetch(`${this.base}/usuarios`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
}


  