import { Controller, Delete, Get, Headers, Param } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async list(@Headers('x-client-id') clientId: string) {
    return this.accounts.listByClientId(clientId);
  }

  @Delete(':accountId')
  async remove(
    @Headers('x-client-id') clientId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.accounts.remove(clientId, accountId);
  }
}
