import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { AlertController } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

type Role = 'ADMIN' | 'CLIENT' | 'OPERATOR';

interface UserVM {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  selected?: boolean;
}

interface NewUserPayload {
  fullName: string;
  email: string;
  password: string;
  role: 'user' | 'admin' | 'operator';
}

@Component({
  standalone: true,
  selector: 'app-admin-usuarios-roles',
  imports: [CommonModule, FormsModule, IonContent, IonIcon],
  template: `
  <ion-content class="users-wrap">
    <!-- Modal Cambiar Perfil -->
    <div class="modal-backdrop" *ngIf="showRoleModal">
      <div class="modal small">
        <h2>Cambiar perfil</h2>
        <div class="modal-body">
          <p class="muted">Selecciona el nuevo rol para <strong>{{ roleIds.length }}</strong> usuario(s)</p>
          <div class="role-grid">
            <button type="button" class="role-card" [class.selected]="roleChoice==='user'" (click)="roleChoice='user'">
              <ion-icon name="person-outline"></ion-icon>
              <div>
                <div class="role-title">Cliente</div>
                <div class="role-desc">Acceso a compras y pedidos.</div>
              </div>
            </button>
            <button type="button" class="role-card" [class.selected]="roleChoice==='admin'" (click)="roleChoice='admin'">
              <ion-icon name="shield-checkmark-outline"></ion-icon>
              <div>
                <div class="role-title">Administrador</div>
                <div class="role-desc">Gestión completa del sistema.</div>
              </div>
            </button>
            <button type="button" class="role-card" [class.selected]="roleChoice==='operator'" (click)="roleChoice='operator'">
              <ion-icon name="construct-outline"></ion-icon>
              <div>
                <div class="role-title">Operador</div>
                <div class="role-desc">Centro de operaciones y tareas.</div>
              </div>
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn primary" (click)="applyRoleChange()">Aplicar</button>
          <button type="button" class="btn secondary" (click)="closeRoleModal()">Cancelar</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop" *ngIf="showModal">
      <div class="modal">
        <h2>Nuevo usuario</h2>
        <form (ngSubmit)="saveNewUser()">
          <div class="modal-body">
            <label>
              Nombre completo
              <input type="text" [(ngModel)]="newUser.fullName" name="fullName" required>
            </label>
            <label>
              Correo
              <input type="email" [(ngModel)]="newUser.email" name="email" required>
            </label>
            <label>
              Contraseña
              <input type="password" [(ngModel)]="newUser.password" name="password" required>
            </label>
            <label>
              Perfil
              <select [(ngModel)]="newUser.role" name="role">
                <option value="user">Cliente</option>
                <option value="admin">Administrador</option>
                <option value="operator">Operador</option>
              </select>
            </label>
            <div class="error" *ngIf="newUserError">{{ newUserError }}</div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn primary" [disabled]="saving">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
            <button type="button" class="btn secondary" (click)="closeModal()" [disabled]="saving">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

    <div class="users-header">
      <h1>Usuarios</h1>
      <button class="btn primary" (click)="addUser()">Añadir usuario</button>
    </div>

    <div class="tabs">
      <button class="tab" [class.active]="activeTab==='all'" (click)="activeTab='all'; load()">Todos ({{ total() }})</button>
      <span class="sep">|</span>
      <button class="tab" [class.active]="activeTab==='client'" (click)="activeTab='client'; load()">Cliente ({{ countBy('CLIENT') }})</button>
      <span class="sep">|</span>
      <button class="tab" [class.active]="activeTab==='admin'" (click)="activeTab='admin'; load()">Administrador ({{ countBy('ADMIN') }})</button>
      <span class="sep">|</span>
      <button class="tab" [class.active]="activeTab==='operator'" (click)="activeTab='operator'; load()">Operador ({{ countBy('OPERATOR') }})</button>
    </div>

    <div class="toolbar">
      <div class="search">
        <ion-icon name="search-outline"></ion-icon>
        <input type="text" placeholder="buscar usuario.." [(ngModel)]="query" (ngModelChange)="load()">
      </div>
    </div>

    <div *ngIf="error()" class="error-banner">{{ error() }}</div>
    <div *ngIf="!error() && users().length === 0" class="empty-banner">No hay usuarios para mostrar.</div>

    <div class="table">
      <div class="thead">
        <div class="th select"><input type="checkbox" [checked]="allSelected()" (change)="toggleSelectAll($event)"></div>
        <div class="th user" (click)="toggleSort()">Nombre de usuario <span class="sort" [class.desc]="sortDesc">^</span></div>
        <div class="th name">Nombre</div>
        <div class="th email">Correo electrónico</div>
        <div class="th role">Perfil</div>
      </div>
      <div class="row" *ngFor="let u of filteredSorted()">
        <div class="cell select"><input type="checkbox" [(ngModel)]="u.selected"></div>
        <div class="cell user">
          <ion-icon name="person-outline" class="avatar"></ion-icon>
          <div class="u-meta">
            <div class="u-username">{{ u.username }}</div>
            <div class="u-actions">
              <a href="#" (click)="$event.preventDefault(); view(u)">Ver</a>
              /
              <a href="#" (click)="$event.preventDefault(); edit(u)">Editar</a>
            </div>
          </div>
        </div>
        <div class="cell name">{{ u.fullName }}</div>
        <div class="cell email">{{ u.email }}</div>
        <div class="cell role">{{ roleLabel(u.role) }}</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn" [disabled]="!hasSelection()" (click)="changeRole()">Cambiar perfil</button>
      <button class="btn danger" [disabled]="!hasSelection()" (click)="remove()">Eliminar</button>
    </div>
  </ion-content>
  `,
  styles: [
    `
    .users-wrap { --padding-start:16px; --padding-end:16px; }
    .users-header { display:flex; align-items:center; justify-content:space-between; margin:8px 0 12px; }
    .users-header h1 { margin:0; font-size:22px; }
    .btn { background:#0c4a6e; color:#fff; border:0; padding:8px 14px; border-radius:999px; cursor:pointer; font-weight:600; }
    .btn.primary { background:#0c4a6e; }
    .btn.secondary { background:#475569; }
    .btn.danger { background:#b91c1c; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn.sm { padding:6px 12px; font-size:13px; }

    .tabs { display:flex; align-items:center; gap:8px; margin:6px 0 10px; }
    .tab { background:transparent; border:0; color:#0c4a6e; font-weight:600; cursor:pointer; }
    .tab.active { text-decoration:underline; }
    .sep { color:#94a3b8; }

    .toolbar { display:flex; justify-content:flex-end; margin:8px 0; }
    .search { display:flex; align-items:center; gap:8px; background:#062a3d; color:#fff; padding:6px 10px; border-radius:999px; width:260px; }
    .search ion-icon { font-size:18px; }
    .search input { flex:1; background:transparent; border:0; outline:none; color:#fff; }

    .error-banner { color:#ef4444; margin:8px 0; }
    .empty-banner { color:#94a3b8; margin:8px 0; }

    .table { background:#062a3d; border-radius:8px; color:#e5e7eb; overflow:hidden; }
    .thead, .row { display:grid; grid-template-columns: 40px 1.1fr 1fr 1.4fr 0.8fr; align-items:center; }
    .thead { padding:10px 12px; background:#052536; font-weight:700; }
    .row { padding:10px 12px; border-top:1px solid rgba(255,255,255,.06); }
    .cell, .th { display:flex; align-items:center; gap:10px; }
    .user .avatar { font-size:22px; }
    .u-meta { display:flex; flex-direction:column; }
    .u-username { font-weight:600; }
    .u-actions a { color:#93c5fd; font-size:12px; text-decoration:none; }
    .u-actions a:hover { text-decoration:underline; }
    .sort { margin-left:4px; opacity:.7; display:inline-block; transform:rotate(180deg); transition: transform .15s ease; }
    .sort.desc { transform:rotate(0deg); }

    .actions { display:flex; gap:10px; justify-content:flex-end; margin:12px 0; }

    .modal-backdrop {
      position:fixed;
      inset:0;
      background:rgba(15,23,42,0.65);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:1000;
      padding:16px;
    }
    .modal {
      background:#fff;
      color:#0f172a;
      border-radius:12px;
      padding:20px;
      width:100%;
      max-width:420px;
      box-shadow:0 20px 35px rgba(15,23,42,0.25);
    }
    .modal h2 { margin:0 0 12px; font-size:20px; }
    .modal-body { display:flex; flex-direction:column; gap:12px; }
    .modal-body label { display:flex; flex-direction:column; font-size:14px; gap:6px; }
    .modal-body input,
    .modal-body select {
      border:1px solid #cbd5f5;
      border-radius:6px;
      padding:8px;
      font-size:14px;
    }
    .modal-actions {
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:18px;
    }
    .modal.small { max-width: 720px; width: min(720px, 92vw); }
    .radio-group { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
    .radio { display:flex; align-items:center; gap:10px; font-size:14px; }
    .muted { color:#475569; margin:0 0 8px; }
    /* Grid que se adapta al ancho del modal, evitando desbordes */
    .role-grid { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .role-card {
      background:#0c4a6e0f; border:1px solid #cbd5e1; border-radius:10px; padding:12px; text-align:left;
      display:flex; gap:10px; align-items:center; cursor:pointer; transition:border .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .role-card:hover { border-color:#0c4a6e; box-shadow:0 6px 16px rgba(12,74,110,0.18); }
    .role-card.selected { border-color:#0c4a6e; background:#0c4a6e12; box-shadow:0 8px 18px rgba(12,74,110,0.22); }
    .role-card ion-icon { font-size:22px; color:#0c4a6e; }
    .role-title { font-weight:700; }
    .role-desc { font-size:12px; color:#64748b; }
    .error { color:#b91c1c; font-size:13px; }
    `
  ]
})
export class AdminUsuariosRolesPage {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiBase = (environment.apiUrl || '').replace(/\/$/, '');

  private endpoint(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (this.apiBase) {
      return `${this.apiBase}${normalized}`;
    }
    if (normalized.startsWith('/api/')) {
      return normalized;
    }
    return `/api${normalized}`;
  }

  // Lista completa (todas las categorías)
  allUsers = signal<UserVM[]>([]);
  // Señal existente usada por la tabla (puede coincidir con allUsers)
  users = signal<UserVM[]>([]);
  query = '';
  activeTab: 'all' | 'client' | 'admin' | 'operator' = 'all';
  sortDesc = true;

  error = signal<string | null>(null);

  showModal = false;
  saving = false;
  newUser: NewUserPayload = { fullName: '', email: '', password: '', role: 'user' };
  newUserError = '';

  // Cambiar rol modal
  showRoleModal = false;
  roleChoice: 'user'|'admin'|'operator' = 'user';
  roleIds: number[] = [];

  total = computed(() => this.allUsers().length);
  countBy = (r: Role) => this.allUsers().filter(u => u.role === r).length;

  private baseListByTab(): UserVM[] {
    const list = this.allUsers();
    if (this.activeTab === 'client') return list.filter(u => u.role === 'CLIENT');
    if (this.activeTab === 'admin') return list.filter(u => u.role === 'ADMIN');
    if (this.activeTab === 'operator') return list.filter(u => u.role === 'OPERATOR');
    return list;
  }

  filteredSorted() {
    const q = this.query.trim().toLowerCase();
    return this.baseListByTab()
      .filter(u => {
        const inText = !q || [u.username, u.fullName, u.email].some(s => s.toLowerCase().includes(q));
        return inText;
      })
      .sort((a, b) => {
        const va = a.username.toLowerCase();
        const vb = b.username.toLowerCase();
        return this.sortDesc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
  }

  toggleSort() {
    this.sortDesc = !this.sortDesc;
  }

  allSelected() {
    const list = this.filteredSorted();
    return list.length > 0 && list.every(u => !!u.selected);
  }

  toggleSelectAll(ev: any) {
    const checked = !!ev?.target?.checked;
    this.filteredSorted().forEach(u => (u.selected = checked));
  }

  hasSelection() {
    return this.users().some(u => u.selected);
  }

  roleLabel(r: Role) {
    return r === 'ADMIN' ? 'Administrador' : r === 'CLIENT' ? 'Cliente' : 'Operador';
  }

  ngOnInit() {
    this.load();
  }

  load() {
    // Siempre traemos todos para mantener los contadores correctos
    const params: any = {};
    if (this.query?.trim()) params.q = this.query.trim();

    this.http.get<any[]>(this.endpoint('/admin/users'), { params }).subscribe({
      next: users => {
        const mapRole = (r: string): Role => {
          const key = r?.toLowerCase();
          if (key === 'admin') return 'ADMIN';
          if (key === 'operator') return 'OPERATOR';
          return 'CLIENT';
        };
        const vm = users.map(u => ({
          id: u.id,
          username: (u.email || '').split('@')[0] || u.fullName || `user${u.id}`,
          fullName: u.fullName || '',
          email: u.email,
          role: mapRole(u.role)
        }) as UserVM);
        this.allUsers.set(vm);
        this.users.set(vm);
        this.error.set(null);
      },
      error: err => {
        this.users.set([]);
        this.error.set(err?.error?.message || 'No se pudieron cargar los usuarios');
      }
    });
  }

  addUser() {
    this.newUser = { fullName: '', email: '', password: '', role: 'user' };
    this.newUserError = '';
    this.showModal = true;
  }

  closeModal() {
    if (this.saving) return;
    this.showModal = false;
  }

  saveNewUser() {
    if (this.saving) return;
    const fullName = this.newUser.fullName.trim();
    const email = this.newUser.email.trim();
    const password = this.newUser.password;

    if (!fullName) {
      this.newUserError = 'El nombre es obligatorio.';
      return;
    }
    if (!email) {
      this.newUserError = 'El correo es obligatorio.';
      return;
    }
    if (!this.isValidEmail(email)) {
      this.newUserError = 'El correo no es válido.';
      return;
    }
    if (!password || password.length < 6) {
      this.newUserError = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    this.saving = true;
    this.newUserError = '';
    this.http.post(this.endpoint('/admin/users'), {
      fullName,
      email,
      password,
      role: this.newUser.role
    }).subscribe({
      next: () => {
        this.saving = false;
        this.showModal = false;
        this.load();
      },
      error: err => {
        this.saving = false;
        const issues = err?.error?.issues;
        if (Array.isArray(issues) && issues.length) {
          this.newUserError = issues[0]?.message || 'Datos inválidos.';
          return;
        }
        this.newUserError = err?.error?.message || 'No se pudo crear el usuario.';
      }
    });
  }

  edit(u: UserVM) {
    this.router.navigateByUrl('/admin/usuarios/' + u.id);
  }

  view(u: UserVM) {
    this.router.navigateByUrl('/admin/usuarios/' + u.id);
  }

  changeRole() {
    const sel = this.users().filter(u => u.selected);
    if (sel.length === 0) return;
    this.roleIds = sel.map(s => s.id);
    this.roleChoice = 'user';
    this.showRoleModal = true;
  }
  closeRoleModal() { this.showRoleModal = false; }
  applyRoleChange() {
    const role = this.roleChoice;
    const ids = [...this.roleIds];
    this.showRoleModal = false;
    ids.forEach(id => {
      this.http.patch(this.endpoint(`/admin/users/${id}`), { role }).subscribe({ next: () => this.load() });
    });
  }

  remove() {
    const ids = this.users().filter(u => u.selected).map(u => u.id);
    if (ids.length === 0) return;
    if (!confirm('Eliminar usuarios seleccionados?')) return;
    this.http.request('delete', this.endpoint('/admin/users'), { body: { ids } }).subscribe(() => this.load());
  }

  private isValidEmail(email: string) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }
}




