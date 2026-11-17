import { InjectRepository } from '@nestjs/typeorm';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ILike, Repository } from 'typeorm';
import { mkdir, rename, unlink } from 'fs/promises';
import { basename, dirname, resolve } from 'path';

import { QuerySafetyDataFileDto } from './dto/index.js';
import { SafetyDataFile } from './entities/safety-data-file.entity.js';
import { hdsDir, hdsNameFromUpload } from './hds-upload.js';

/**
 * Hojas de datos de seguridad (PDF). La tabla es la fuente de verdad del
 * catálogo y los archivos viven en `hdsDir()` (fuera del repositorio), con
 * el nombre de la HDS. Antes los PDF iban en el repo (307 MB) y al arrancar
 * se vaciaba y rellenaba la tabla desde la carpeta: con dos instancias del
 * API en cluster chocaban (duplicate key) y agregar una HDS exigía un deploy.
 */
@Injectable()
export class SafetyDataFilesService {
  private readonly logger = new Logger(SafetyDataFilesService.name);

  constructor(
    @InjectRepository(SafetyDataFile)
    private readonly safetyDataFileRepository: Repository<SafetyDataFile>,
  ) {}

  /** Carpeta de los PDF (la lee el controlador para las descargas). */
  get filePath(): string {
    return hdsDir();
  }

  async findAll({ name, order, page, limit }: QuerySafetyDataFileDto) {
    const search = name?.trim();

    const options = {
      where: {
        isActive: true,
        ...(search && { name: ILike(`%${search}%`) }),
      },
      order: { name: order === 'desc' ? ('DESC' as const) : ('ASC' as const) },
    };

    if (page === undefined || limit === undefined) {
      return this.safetyDataFileRepository.find(options);
    }

    const limitNumber = Number(limit);

    const [data, count] = await this.safetyDataFileRepository.findAndCount({
      ...options,
      ...(limitNumber !== -1 && {
        take: limitNumber,
        skip: (Number(page) - 1) * limitNumber,
      }),
    });

    return { data, count };
  }

  /** HDS activa del catálogo con ese nombre (descargas). */
  findActiveByName(name: string) {
    return this.safetyDataFileRepository.findOne({
      where: { name, isActive: true },
    });
  }

  /** Sube una HDS nueva; el nombre es el del archivo. 409 si ya existe. */
  async upload(file: Express.Multer.File) {
    const name = hdsNameFromUpload(file.originalname);

    if (await this.safetyDataFileRepository.exists({ where: { name } })) {
      throw new ConflictException(
        `Ya existe una HDS llamada "${name}". Usa "Reemplazar" para actualizarla.`,
      );
    }

    await this.moveIntoPlace(file.path, name);
    try {
      const saved = await this.safetyDataFileRepository.save(
        this.safetyDataFileRepository.create({ name }),
      );
      this.logger.log(`HDS subida: ${name}`);
      return saved;
    } catch (error) {
      // Sin registro no debe quedar el archivo (p. ej. otra subida con el
      // mismo nombre ganó por milisegundos: unique).
      await unlink(this.pathOf(name)).catch(() => undefined);
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(`Ya existe una HDS llamada "${name}".`);
      }
      throw error;
    }
  }

  /** Cambia el PDF de una HDS existente (mismo nombre en el catálogo). */
  async replace(id: number, file: Express.Multer.File) {
    const hds = await this.findActiveOrFail(id);

    await this.moveIntoPlace(file.path, hds.name);
    // Marca la fecha de actualización (el nombre no cambia).
    await this.safetyDataFileRepository.update(id, { name: hds.name });
    this.logger.log(`HDS reemplazada: ${hds.name}`);
    return this.findActiveOrFail(id);
  }

  /** Quita la HDS del catálogo y borra su PDF. */
  async remove(id: number) {
    const hds = await this.findActiveOrFail(id);

    await this.safetyDataFileRepository.delete(id);
    // El registro ya no está: un fallo al borrar el PDF solo queda en el log.
    try {
      await unlink(this.pathOf(hds.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          `No se pudo borrar el PDF de la HDS ${hds.name}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`HDS eliminada: ${hds.name}`);
    return { id, name: hds.name };
  }

  private async findActiveOrFail(id: number) {
    const hds = await this.safetyDataFileRepository.findOne({
      where: { id, isActive: true },
    });
    if (!hds) throw new NotFoundException('Hoja de datos no encontrada.');
    return hds;
  }

  /**
   * Ruta del PDF dentro de la carpeta (exista o no); nunca fuera de ella: el
   * nombre no puede traer carpetas ni "..".
   */
  private pathOf(name: string) {
    const root = resolve(this.filePath);
    const path = resolve(root, name);
    if (
      !name ||
      name.includes('\0') ||
      basename(name) !== name ||
      dirname(path) !== root
    ) {
      throw new NotFoundException('Hoja de datos no encontrada.');
    }
    return path;
  }

  /** Mueve la subida a su lugar (rename: reemplazo atómico). */
  private async moveIntoPlace(uploadedPath: string, name: string) {
    await mkdir(this.filePath, { recursive: true });
    await rename(uploadedPath, this.pathOf(name));
  }
}
