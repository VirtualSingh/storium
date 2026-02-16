import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const DRIVE_FIELDS =
  'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents)';

@Injectable()
export class DriveService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async getUsage(clientId: string, accountId: string) {
    const drive = await this.getDriveClient(clientId, accountId);
    const { data } = await drive.about.get({
      fields: 'storageQuota, user',
    });

    return {
      storageQuota: data.storageQuota,
      user: data.user,
    };
  }

  async listFiles(clientId: string, accountId: string, pageToken?: string) {
    const drive = await this.getDriveClient(clientId, accountId);
    const { data } = await drive.files.list({
      fields: DRIVE_FIELDS,
      pageSize: 50,
      pageToken,
      q: "'root' in parents and trashed = false",
      orderBy: 'modifiedTime desc',
    });

    return data;
  }

  async transferFile(
    clientId: string,
    sourceAccountId: string,
    targetAccountId: string,
    fileId: string,
    action: 'copy' | 'move',
  ) {
    if (!fileId) {
      throw new BadRequestException('fileId is required.');
    }

    if (sourceAccountId === targetAccountId) {
      throw new BadRequestException('Source and target accounts must differ.');
    }

    const sourceDrive = await this.getDriveClient(clientId, sourceAccountId);
    const targetDrive = await this.getDriveClient(clientId, targetAccountId);

    const { data: fileMeta } = await sourceDrive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
    });

    if (!fileMeta.id || !fileMeta.name || !fileMeta.mimeType) {
      throw new BadRequestException('Unable to read file metadata.');
    }

    if (fileMeta.mimeType.startsWith('application/vnd.google-apps')) {
      throw new BadRequestException('Google Docs exports are not supported yet.');
    }

    const { data: stream } = await sourceDrive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    await targetDrive.files.create({
      requestBody: {
        name: fileMeta.name,
      },
      media: {
        mimeType: fileMeta.mimeType,
        body: stream,
      },
    });

    if (action === 'move') {
      await sourceDrive.files.delete({ fileId });
    }

    return { success: true };
  }

  private async getDriveClient(clientId: string, accountId: string) {
    if (!clientId) {
      throw new BadRequestException('Missing clientId.');
    }

    const user = await this.users.getByClientId(clientId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const account = await this.prisma.linkedAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });

    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    const clientIdEnv = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecretEnv = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientIdEnv || !clientSecretEnv || !redirectUri) {
      throw new BadRequestException('Missing Google OAuth configuration.');
    }

    const oauth2Client = new google.auth.OAuth2(
      clientIdEnv,
      clientSecretEnv,
      redirectUri,
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken ?? undefined,
      expiry_date: account.tokenExpiry?.getTime(),
    });

    await this.refreshIfNeeded(oauth2Client, account.id);

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  private async refreshIfNeeded(oauth2Client: InstanceType<typeof google.auth.OAuth2>, accountId: string) {
    const accessToken = await oauth2Client.getAccessToken();
    if (!accessToken?.token) {
      throw new ForbiddenException('Unable to refresh access token.');
    }

    const expiryDate = oauth2Client.credentials.expiry_date
      ? new Date(oauth2Client.credentials.expiry_date)
      : null;

    await this.prisma.linkedAccount.update({
      where: { id: accountId },
      data: {
        accessToken: accessToken.token,
        tokenExpiry: expiryDate,
      },
    });
  }
}
