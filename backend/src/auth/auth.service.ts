import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
];

type OAuthState = {
  clientId: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  createOAuthClient() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('Missing Google OAuth configuration.');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  getAuthUrl(clientId: string) {
    if (!clientId) {
      throw new BadRequestException('clientId is required.');
    }

    const oauth2Client = this.createOAuthClient();
    const state = this.encodeState({ clientId });

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state,
    });
  }

  async handleOAuthCallback(code: string, state: string) {
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth response data.');
    }

    const parsedState = this.decodeState(state);
    if (!parsedState?.clientId) {
      throw new BadRequestException('Invalid OAuth state.');
    }

    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new BadRequestException('Missing access token.');
    }

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });

    const { data: profile } = await oauth2.userinfo.get();

    if (!profile?.id || !profile?.email) {
      throw new BadRequestException('Unable to read Google profile.');
    }

    const user = await this.users.getOrCreateByClientId(parsedState.clientId);

    const account = await this.prisma.linkedAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.id,
        },
      },
      create: {
        userId: user.id,
        provider: 'google',
        providerAccountId: profile.id,
        email: profile.email,
        displayName: profile.name ?? null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        userId: user.id,
        email: profile.email,
        displayName: profile.name ?? null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    return account;
  }

  private encodeState(state: OAuthState) {
    return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url');
  }

  private decodeState(state: string): OAuthState | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      return JSON.parse(decoded) as OAuthState;
    } catch {
      return null;
    }
  }
}
