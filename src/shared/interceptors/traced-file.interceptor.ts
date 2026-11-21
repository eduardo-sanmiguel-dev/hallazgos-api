import {
  type CallHandler,
  type ExecutionContext,
  mixin,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Request } from 'express';

import { traced } from '../tracing/traced.js';

/**
 * `FileInterceptor` de Nest con un span `upload.receive`: multer recibe el
 * archivo dentro de la petición y, desde un celular con mala señal, eso puede
 * ser la mayor parte del tiempo. El span termina cuando el archivo ya está en
 * disco (antes de pipes y handler) y lleva el tamaño declarado y el recibido.
 */
export const TracedFileInterceptor = (
  fieldName: string,
  localOptions?: MulterOptions,
): Type<NestInterceptor> => {
  class Traced extends FileInterceptor(fieldName, localOptions) {
    intercept(context: ExecutionContext, next: CallHandler) {
      const request = context.switchToHttp().getRequest<Request>();
      const contentLength = Number(request.headers['content-length']);
      return traced(
        'upload.receive',
        {
          'upload.field': fieldName,
          ...(Number.isFinite(contentLength) && {
            'upload.content_length': contentLength,
          }),
        },
        async (span) => {
          const handled = await super.intercept(context, next);
          if (request.file)
            span.setAttribute('upload.bytes', request.file.size);
          return handled;
        },
      );
    }
  }
  return mixin(Traced);
};
