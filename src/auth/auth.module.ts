import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { User } from 'users/entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from './jwt.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    // Límites por IP (memoria) para los endpoints públicos de auth; cada
    // endpoint fija el suyo con @Throttle.
    ThrottlerModule.forRoot([{ name: 'auth', ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtService],
  exports: [AuthService, JwtService],
})
export class AuthModule {}
