// src/app/home/home.page.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class HomePage implements OnInit {
  me: any = null;
  loading = false;
  error = '';

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.fetchMe();
  }

  fetchMe() {
    this.loading = true;
    this.http.get<any>('http://localhost:3000/me').subscribe({
      next: (res) => { this.me = res.user; this.loading = false; },
      error: () => { this.error = 'No autorizado'; this.loading = false; }
    });
  }

  logout() {
    localStorage.removeItem('ks_token');
    this.router.navigateByUrl('/login');
  }
}
