import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { ILike, Repository } from 'typeorm';
import { readdirSync } from 'fs';
import { join } from 'path';

import { CreateSafetyDataFileDto, UpdateSafetyDataFileDto } from './dto';
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
    const files = readdirSync(this.filePath);
    for (const fileName of files) {
      const existingFile = await this.safetyDataFileRepository.findOneBy({
        name: fileName,
      });
      if (!existingFile) {
        const newFile = this.safetyDataFileRepository.create({
          name: fileName,
        });
        await this.safetyDataFileRepository.save(newFile);
      }
    }
  }

  create(createSafetyDataFileDto: CreateSafetyDataFileDto) {
    return createSafetyDataFileDto;
  }

  findAll(name: string) {
    return this.safetyDataFileRepository.find({
      where: { isActive: true, ...(name && { name: ILike(`%${name}%`) }) },
      order: { name: 'ASC' },
    });
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
