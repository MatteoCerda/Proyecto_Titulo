import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class UploadsService {
  private http = inject(HttpClient);

  uploadDesign(file: File, extra: { notes?: string }) {
    const form = new FormData();
    form.append('file', file);
    if (extra.notes) form.append('notes', extra.notes);
    return this.http.post('/api/uploads/design', form);
  }
}
