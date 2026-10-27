import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ROLE_ADMINISTRADOR } from '../constants/index.js';
import { sessionEndedException } from '../errors/error-codes.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (!user) throw sessionEndedException();
    if (user.role !== ROLE_ADMINISTRADOR)
      throw new ForbiddenException(
        'Solo los administradores pueden realizar esta acción',
      );
    return true;
  }
}
