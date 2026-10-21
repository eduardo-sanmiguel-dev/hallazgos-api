import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { DataSource, In } from 'typeorm';
import { JwtService } from '../auth/jwt.service.js';
import { UsersService } from '../users/users.service.js';
import { Ics } from '../ics/entities/ics.entity.js';
import { Evidence } from './entities/evidence.entity.js';
import { safeFilePath } from '../shared/utils/safe-file-path.js';
import { join, posix } from 'path';

@Injectable()
export class EvidenceImageAccessMiddleware implements NestMiddleware {
  private readonly logger = new Logger(EvidenceImageAccessMiddleware.name);
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    let pathname: string;
    try {
      const decoded = decodeURIComponent(req.path).replace(/\\/g, '/');
      if (decoded.split('/').includes('..')) throw new Error('Ruta inválida');
      pathname = posix.normalize(decoded);
    } catch {
      res
        .status(404)
        .json({ statusCode: 404, message: 'Imagen no encontrada' });
      return;
    }
    const prefix = '/static/images/evidences/';
    if (!pathname.toLowerCase().startsWith(prefix)) {
      next();
      return;
    }
    const filename = pathname.slice(prefix.length);
    // Las URLs se conservan, pero cada descarga debe comprobar sesión y planta.
    res.setHeader('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    res.vary('Authorization');
    let user;
    try {
      const token =
        req.cookies?.token ||
        req.headers.authorization?.replace(/^Bearer /, '');
      const payload = this.jwt.verify(token || '');
      user = await this.users.findOne(payload.userId);
    } catch {
      res
        .status(401)
        .json({ statusCode: 401, message: 'Credenciales no válidas' });
      return;
    }
    if (!/^[^\\/\0]+\.(?:png|jpe?g|webp)$/i.test(filename)) {
      res
        .status(404)
        .json({ statusCode: 404, message: 'Imagen no encontrada' });
      return;
    }
    try {
      const manufacturingPlant = {
        id: In(user.manufacturingPlants.map((plant) => plant.id)),
      };
      let found = await this.dataSource.getRepository(Evidence).exists({
        where: [
          { imgEvidence: filename, manufacturingPlant },
          { imgProcess: filename, manufacturingPlant },
          { imgSolution: filename, manufacturingPlant },
        ],
      });
      if (!found)
        found = await this.dataSource
          .getRepository(Ics)
          .exists({ where: { imgEvidence: filename, manufacturingPlant } });
      const file = safeFilePath(
        join(process.cwd(), 'public', 'static', 'images', 'evidences'),
        filename,
      );
      if (!found || !file) {
        res
          .status(404)
          .json({ statusCode: 404, message: 'Imagen no encontrada' });
        return;
      }
      res.sendFile(file, { cacheControl: false }, (error) => {
        if (error && !res.headersSent)
          res
            .status(404)
            .json({ statusCode: 404, message: 'Imagen no encontrada' });
      });
    } catch (error) {
      this.logger.error(
        'No se pudo autorizar la descarga de imagen',
        error?.stack,
      );
      res
        .status(500)
        .json({ statusCode: 500, message: 'No se pudo cargar la imagen' });
    }
  }
}

/** Registrar antes de app.init/listen y después de cookieParser. */
export const registerEvidenceImageAccess = (app: {
  use: (...args: any[]) => unknown;
  get: (
    token: typeof EvidenceImageAccessMiddleware,
  ) => EvidenceImageAccessMiddleware;
}) => {
  const guard = app.get(EvidenceImageAccessMiddleware);
  // Ruta completa para normalizar también separadores repetidos y segmentos codificados.
  app.use(guard.use.bind(guard));
};
