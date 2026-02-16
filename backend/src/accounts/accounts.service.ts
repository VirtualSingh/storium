import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async listByClientId(clientId: string) {
    const user = await this.users.getByClientId(clientId);
    if (!user) {
      return [];
    }

    return this.prisma.linkedAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        provider: true,
        createdAt: true,
      },
    });
  }

  async remove(clientId: string, accountId: string) {
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

    await this.prisma.linkedAccount.delete({
      where: { id: account.id },
    });

    return { success: true };
  }
}
