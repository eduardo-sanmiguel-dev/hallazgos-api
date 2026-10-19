import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { ILike, Repository } from 'typeorm';
import { readdirSync } from 'fs';
import { join } from 'path';

import {
  CreateSafetyDataFileDto,
  QuerySafetyDataFileDto,
  UpdateSafetyDataFileDto,
} from './dto';
import { SafetyDataFile } from './entities/safety-data-file.entity';

@Injectable()
export class SafetyDataFilesService {
  readonly filePath: string = join(process.cwd(), 'src/files/hds_files');

  constructor(
    @InjectRepository(SafetyDataFile)
    private readonly safetyDataFileRepository: Repository<SafetyDataFile>,
  ) {
    this.seed();
  }

  async seed() {
    await this.safetyDataFileRepository.clear();

    const files = readdirSync(this.filePath);

    for (const fileName of files) {
      const newFile = this.safetyDataFileRepository.create({
        name: fileName,
      });
      await this.safetyDataFileRepository.save(newFile);
    }
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
