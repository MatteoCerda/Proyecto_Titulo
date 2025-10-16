import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';

type Role = 'ADMIN' | 'CLIENT' | 'OPERATOR';
interface UserVM {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  selected?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-admin-usuarios-roles',
  imports: [CommonModule, FormsModule, IonContent, IonIcon],
  template: `
  <ion-content class="users-wrap">
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
              Contrasena
              <input type="password" [(ngModel)]="newUser.password" name="password" required>
            </label>
            <label>
              Perfil
              <select [(ngModel)]="newUser.role" name="role">
                <option value="user">Cliente</option>
                <option value="admin">Administrador</option>
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
      <button class="btn primary" (click)="addUser()">Anadir usuario</button>
    </div>

    <div class="tabs">
      <button class="tab" [class.active]="activeTab==='all'" (click)="activeTab='all'; load()">Todos ({{ total() }})</button>
      <span class="sep">|</span>
      <button class="tab" [class.active]="activeTab==='client'" (click)="activeTab='client'; load()">Cliente ({{ countBy('CLIENT') }})</button>
      <span class="sep">|</span>
      <button class="tab" [class.active]="activeTab==='admin'" (click)="activeTab='admin'; load()">Administrador ({{ countBy('ADMIN') }})</button>
    </div>

    <div class="toolbar">
      <div class="search">
        <ion-icon name="search-outline"></ion-icon>
        <input type="text" placeholder="buscar usuario.." [(ngModel)]="query" (ngModelChange)="load()">
      </div>
    </div>

    <div class="table">
      <div class="thead">
        <div class="th select"><input type="checkbox" [checked]="allSelected()" (change)="toggleSelectAll($event)"></div>
        <div class="th user" (click)="toggleSort()">Nombre de usuario <span class="sort" [class.desc]="sortDesc">^</span></div>
        <div class="th name">Nombre</div>
        <div class="th email">Correo Electronico</div>
        <div class="th role">Perfil</div>
      </div>
      <div class="row" *ngFor="let u of filteredSorted()">
        <div class="cell select"><input type="checkbox" [(ngModel)]="u.selected"></div>
        <div class="cell user">
          <ion-icon name="person-outline" class="avatar"></ion-icon>
          <div class="u-meta">
            <div class="u-username">{{ u.username }}</div>
            <div class="u-actions">
              <a href="#" (click)="$event.preventDefault(); edit(u)">Ver</a>
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
    .btn { background:#0c4a6e; color:#fff; border:0; padding:8px 14px; border-radius:999px; cursor:pointer; }
    .btn.primary { background:#0c4a6e; }
    .btn.secondary { background:#475569; }
    .btn.danger { background:#b91c1c; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }

    .tabs { display:flex; align-items:center; gap:8px; margin:6px 0 10px; }
    .tab { background:transparent; border:0; color:#0c4a6e; font-weight:600; cursor:pointer; }
    .tab.active { text-decoration:underline; }
    .sep { color:#94a3b8; }

    .toolbar { display:flex; justify-content:flex-end; margin:8px 0; }
    .search { display:flex; align-items:center; gap:8px; background:#062a3d; color:#fff; padding:6px 10px; border-radius:999px; width:260px; }
    .search ion-icon { font-size:18px; }
    .search input { flex:1; background:transparent; border:0; outline:none; color:#fff; }

    .table { background:#062a3d; border-radius:8px; color:#e5e7eb; overflow:hidden; }
    .thead, .row { display:grid; grid-template-columns: 40px 1.1fr 1fr 1.4fr 0.8fr; align-items:center; }
    .thead { padding:10px 12px; background:#052536; font-weight:700; }
    .row { padding:10px 12px; border-top:1px solid rgba(255,255,255,.06); }
    .cell, .th { display:flex; align-items:center; gap:10px; }
    .user .avatar { font-size:22px; }
    .u-meta { display:flex; flex-direction:column; }
    .u-username { font-weight:600; }
    .u-actions { font-size:12px; display:flex; gap:4px; }
    .u-actions a { color:#93c5fd; text-decoration:none; }
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
    .error { color:#b91c1c; font-size:13px; }
    `
  ]
})
export class AdminUsuariosRolesPage {
  private http = inject(HttpClient);
  users = signal<UserVM[]>([]);
  query = '';
  activeTab: 'all' | 'client' | 'admin' = 'all';
  sortDesc = true;

  showModal = false;
  saving = false;
  newUser: { fullName: string; email: string; password: string; role: 'user' | 'admin' } = {
    fullName: '',
    email: '',
    password: '',
    role: 'user'
  };
  newUserError = '';

  total = computed(() => this.users().length);
  countBy = (r: Role) => this.users().filter(u => u.role === r).length;

  filteredSorted() {
    const q = this.query.trim().toLowerCase();
    const roleFilter = this.activeTab === 'client' ? 'CLIENT' : this.activeTab === 'admin' ? 'ADMIN' : undefined;
    const list = this.users()
      .filter(u => {
        const inText = !q || [u.username, u.fullName, u.email].some(s => s.toLowerCase().includes(q));
        const inRole = !roleFilter || u.role === roleFilter;
        return inText && inRole;
      })
      .sort((a, b) => {
        const va = a.username.toLowerCase();
        const vb = b.username.toLowerCase();
        return this.sortDesc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    return list;
  }

  toggleSort() {
    this.sortDesc = !this.sortDesc;
  }
  allSelected() {
    const list = this.filteredSorted();
    return list.length > 0 && list.every(u => !!u.selected);
  }
  toggleSelectAll(ev: any) {
    const ck = !!ev?.target?.checked;
    this.filteredSorted().forEach(u => (u.selected = ck));
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
    const params: any = {};
    if (this.activeTab === 'client') params.role = 'user';
    if (this.activeTab === 'admin') params.role = 'admin';
    if (this.query?.trim()) params.q = this.query.trim();
    this.http.get<any[]>(`http://localhost:3000/admin/users`, { params }).subscribe(users => {
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
      this.users.set(vm);
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
      this.newUserError = 'El correo no es valido.';
      return;
    }
    if (!password || password.length < 6) {
      this.newUserError = 'La contrasena debe tener al menos 6 caracteres.';
      return;
    }

    this.saving = true;
    this.newUserError = '';
    this.http.post(`http://localhost:3000/admin/users`, {
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
      error: (err) => {
        this.saving = false;
        const issues = err?.error?.issues;
        if (Array.isArray(issues) && issues.length) {
          this.newUserError = issues[0]?.message || 'Datos invalidos.';
          return;
        }
        this.newUserError = err?.error?.message || 'No se pudo crear el usuario.';
      }
    });
  }

  edit(u: UserVM) {
    (window as any).location.href = '/admin/usuarios/' + u.id;
  }

  view(u: UserVM) {
    (window as any).location.href = '/admin/usuarios/' + u.id;
  }

  changeRole() {
    const sel = this.users().filter(u => u.selected);
    if (sel.length === 0) return;
    const to = prompt('Nuevo rol para seleccionados (admin|user):', 'user');
    if (!to) return;
    sel.forEach(u => {
      this.http.patch(`http://localhost:3000/admin/users/${u.id}`, { role: to }).subscribe(() => this.load());
    });
  }

  remove() {
    const ids = this.users().filter(u => u.selected).map(u => u.id);
    if (ids.length === 0) return;
    if (!confirm('Eliminar usuarios seleccionados?')) return;
    this.http.request('delete', `http://localhost:3000/admin/users`, { body: { ids } }).subscribe(() => this.load());
  }

  private isValidEmail(email: string) {
    const pattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return pattern.test(email);
  }
}
