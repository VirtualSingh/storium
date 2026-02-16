import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [DriveController],
  providers: [DriveService],
})
export class DriveModule {}
