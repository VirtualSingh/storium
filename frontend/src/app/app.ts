import { Component, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, combineLatest, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

type LinkedAccount = {
  id: string;
  email: string;
  displayName?: string | null;
  provider: string;
  createdAt: string;
  usage?: {
    storageQuota?: {
      limit?: string | null;
      usage?: string | null;
      usageInDrive?: string | null;
      usageInDriveTrash?: string | null;
    };
  };
};

type FilesResponse = {
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
  }>;
  nextPageToken?: string;
};

type TransferAction = 'copy' | 'move';

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App {  
  private readonly apiBase = 'http://localhost:3000';
  private readonly http: HttpClient = inject(HttpClient);
  private readonly refreshCounter$ = new BehaviorSubject<number>(0);
  private readonly activeAccountId$ = new BehaviorSubject<string | null>(null);
  private readonly clientId = this.getClientId();
  private readonly headers = new HttpHeaders({
    'X-Client-Id': this.clientId,
  });

  statusMessage = '';
  activeAccountId: string | null = null;
  targetAccountId: string | null = null;
  transferStatus: string | null = null;

  readonly connectUrl = `${this.apiBase}/auth/google/start?clientId=${this.clientId}`;

  readonly accounts$ = this.refreshCounter$.pipe(
    switchMap(() =>
      this.http
        .get<LinkedAccount[]>(`${this.apiBase}/accounts`, { headers: this.headers })
        .pipe(
          switchMap((accounts) => {
            if (!accounts.length) {
              return of([]);
            }

            return forkJoin(
              accounts.map((account) =>
                this.http
                  .get<{
                    storageQuota?: {
                      limit?: string | null;
                      usage?: string | null;
                      usageInDrive?: string | null;
                      usageInDriveTrash?: string | null;
                    };
                  }>(
                    `${this.apiBase}/accounts/${account.id}/usage`,
                    { headers: this.headers },
                  )
                  .pipe(map((usage) => ({ ...account, usage }))),
              ),
            );
          }),
          tap((accounts) => {
            if (!this.activeAccountId && accounts.length) {
              this.setActiveAccount(accounts[0].id);
            }
            if (this.targetAccountId && accounts.every((account) => account.id !== this.targetAccountId)) {
              this.targetAccountId = null;
            }
          }),
        ),
    ),
  );

  readonly files$ = combineLatest([this.activeAccountId$, this.refreshCounter$]).pipe(
    switchMap(([accountId]) => {
      if (!accountId) {
        return of<FilesResponse | null>(null);
      }

      return this.http
        .get<FilesResponse>(`${this.apiBase}/accounts/${accountId}/files`, {
          headers: this.headers,
        })
        .pipe(catchError(() => of(null)));
    }),
  );

  constructor() {
    this.readOAuthStatus();
  }

  refresh() {
    this.refreshCounter$.next(this.refreshCounter$.value + 1);
  }

  setActiveAccount(accountId: string) {
    this.activeAccountId = accountId;
    this.activeAccountId$.next(accountId);
  }

  setTargetAccount(accountId: string | null) {
    this.targetAccountId = accountId;
  }

  async removeAccount(accountId: string) {
    await firstValueFrom(
      this.http.delete(`${this.apiBase}/accounts/${accountId}`, { headers: this.headers }),
    );
    this.refresh();
  }

  transferFile(fileId: string, action: TransferAction) {
    if (!this.activeAccountId || !this.targetAccountId) {
      this.transferStatus = 'Select a target account first.';
      return;
    }

    this.transferStatus = 'Working...';
    this.http
      .post(
        `${this.apiBase}/files/transfer`,
        {
          sourceAccountId: this.activeAccountId,
          targetAccountId: this.targetAccountId,
          fileId,
          action,
        },
        { headers: this.headers },
      )
      .pipe(
        tap(() => {
          this.transferStatus = `File ${action} started.`;
          this.refresh();
        }),
        catchError((error) => {
          const message = error?.error?.message ?? 'Transfer failed.';
          this.transferStatus = message;
          return of(null);
        }),
      )
      .subscribe();
  }

  formatBytes(value?: string | null) {
    if (!value) {
      return '0 B';
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    let size = numberValue;

    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }

    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  private getClientId() {
    const existing = localStorage.getItem('storium_client_id');
    if (existing) {
      return existing;
    }

    const generated = crypto.randomUUID();
    localStorage.setItem('storium_client_id', generated);
    return generated;
  }

  private readOAuthStatus() {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked');
    const error = params.get('error');

    if (linked === '1') {
      this.statusMessage = 'Google account linked successfully.';
      this.refresh();
    }

    if (linked === '0') {
      this.statusMessage = error ? `Link failed: ${error}` : 'Link failed.';
    }

    if (linked !== null) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}
