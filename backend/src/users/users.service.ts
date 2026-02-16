import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateByClientId(clientId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { clientId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: { clientId },
    });
  }

  async getByClientId(clientId: string) {
    return this.prisma.user.findUnique({
      where: { clientId },
    });
  }
}
