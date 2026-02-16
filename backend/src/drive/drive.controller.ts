import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { DriveService } from './drive.service';

@Controller()
export class DriveController {
  constructor(private readonly drive: DriveService) {}

  @Get('accounts/:accountId/usage')
  async usage(
    @Headers('x-client-id') clientId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.drive.getUsage(clientId, accountId);
  }

  @Get('accounts/:accountId/files')
  async files(
    @Headers('x-client-id') clientId: string,
    @Param('accountId') accountId: string,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.drive.listFiles(clientId, accountId, pageToken);
  }

  @Post('files/transfer')
  async transfer(
    @Headers('x-client-id') clientId: string,
    @Body()
    body: {
      sourceAccountId: string;
      targetAccountId: string;
      fileId: string;
      action: 'copy' | 'move';
    },
  ) {
    return this.drive.transferFile(
      clientId,
      body.sourceAccountId,
      body.targetAccountId,
      body.fileId,
      body.action,
    );
  }
}
