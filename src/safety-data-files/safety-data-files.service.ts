import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { ILike, Repository } from 'typeorm';
import { readdirSync } from 'fs';
import { join } from 'path';

import {
  CreateSafetyDataFileDto,
  QuerySafetyDataFileDto,
  UpdateSafetyDataFileDto,
} from './dto/index.js';
import { SafetyDataFile } from './entities/safety-data-file.entity.js';

@Injectable()
export class SafetyDataFilesService implements OnModuleInit {
  private readonly logger = new Logger(SafetyDataFilesService.name);

  readonly filePath: string = join(process.cwd(), 'src/files/hds_files');

  constructor(
    @InjectRepository(SafetyDataFile)
    private readonly safetyDataFileRepository: Repository<SafetyDataFile>,
  ) {}

  // Al iniciar se sincroniza la tabla con los PDF de la carpeta. Antes se
  // lanzaba desde el constructor sin esperar ni manejar errores.
  async onModuleInit() {
    try {
      await this.seed();
    } catch (error) {
      this.logger.error('No se pudo cargar el catálogo de HDS', error?.stack);
    }
  }

  async seed() {
    await this.safetyDataFileRepository.clear();

    const files = readdirSync(this.filePath);

    if (!files.length) return;

    // Una sola inserción en lugar de un INSERT por archivo.
    await this.safetyDataFileRepository.insert(
      files.map((fileName) => ({ name: fileName })),
    );
  }

  create(createSafetyDataFileDto: CreateSafetyDataFileDto) {
    return createSafetyDataFileDto;
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

  findOne(id: number) {
    return `This action returns a #${id} safetyDataFile`;
  }

  update(id: number, updateSafetyDataFileDto: UpdateSafetyDataFileDto) {
    return { id, updateSafetyDataFileDto };
  }

  remove(id: number) {
    return `This action removes a #${id} safetyDataFile`;
  }
}
