// web/src/app/api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UsuarioCreate {
  email: string;
  nombre: string;
  password: string;
}

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  // si te marcaba error en "base = '/api';", usa readonly y tipa el string:
  private readonly base: string = '/api';

  health(): Observable<{ ok: boolean }> {
    return this.http.get<{ ok: boolean }>(`${this.base}/health`);
  }

  crearUsuario(body: UsuarioCreate): Observable<Usuario> {
    return this.http.post<Usuario>(`${this.base}/usuarios`, body);
  }

  listarUsuarios(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(`${this.base}/usuarios`);
  }
}
<<<<<<< HEAD


  
=======
>>>>>>> c1e5e69d69c7be3751d5457cb90cdc0341e42086
