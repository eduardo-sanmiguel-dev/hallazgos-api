import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { unlink } from 'fs/promises';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';

/** Archivos que Multer guardó en disco para esta petición (file / files). */
export const uploadedFiles = (req: Request): Express.Multer.File[] => {
  const { file, files } = req as Request & {
    file?: Express.Multer.File;
    files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
  };
  const all = [
    ...(file ? [file] : []),
    ...(Array.isArray(files) ? files : Object.values(files ?? {}).flat()),
  ];

  return all.filter((uploaded) => !!uploaded?.path);
};

/**
 * Multer guarda la imagen en disco antes de que corran pipes, permisos y
 * reglas de estado. Si la petición termina en error (400/403/404/409 o
 * cualquier excepción), el archivo quedaba huérfano: este interceptor lo
 * borra y relanza el error original sin cambiarlo. Si la petición termina
 * bien no toca nada.
 *
 * Se registra como interceptor global (APP_INTERCEPTOR): envuelve al
 * FileInterceptor de cada ruta, así que cuando el error llega aquí req.file
 * ya existe.
 */
@Injectable()
export class DeleteUploadsOnErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeleteUploadsOnErrorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();

    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          from(this.deleteUploads(req)).pipe(
            mergeMap(() => throwError(() => error)),
          ),
        ),
      );
  }

  /** Nunca lanza: si no se puede borrar, solo queda en el log. */
  private async deleteUploads(req: Request) {
    await Promise.all(
      uploadedFiles(req).map(async ({ path }) => {
        try {
          await unlink(path);
        } catch (error) {
          // Ya no existe (p. ej. ImageFileValidationPipe lo borró): nada que hacer.
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;

          this.logger.error(
            `No se pudo borrar la imagen subida ${path}: ${(error as Error)?.message ?? error}`,
          );
        }
      }),
    );
  }
}
