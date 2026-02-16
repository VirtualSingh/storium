import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google/start')
  startGoogle(@Query('clientId') clientId: string, @Res() res: Response) {
    const url = this.auth.getAuthUrl(clientId);
    return res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendOrigin = this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:4200';

    try {
      await this.auth.handleOAuthCallback(code, state);
      return res.redirect(`${frontendOrigin}/?linked=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth failed';
      const encoded = encodeURIComponent(message);
      return res.redirect(`${frontendOrigin}/?linked=0&error=${encoded}`);
    }
  }
}
