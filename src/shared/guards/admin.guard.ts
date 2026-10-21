import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ROLE_ADMINISTRADOR } from '../constants/index.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException('Credenciales no válidas');
    if (user.role !== ROLE_ADMINISTRADOR)
      throw new ForbiddenException(
        'Solo los administradores pueden realizar esta acción',
      );
    return true;
  }
}
