import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type FindManyOptions, ILike, In, Repository } from 'typeorm';
import { findPaginated } from '../shared/utils/index.js';

import { ManufacturingPlant } from './entities/manufacturing-plant.entity.js';
import {
  CreateManufacturingPlantDto,
  QueryManufacturingPlantDto,
  UpdateManufacturingPlantDto,
} from './dto/index.js';

@Injectable()
export class ManufacturingPlantsService {
  constructor(
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlantRepository: Repository<ManufacturingPlant>,
  ) {}

  async create(
    createManufacturingPlantDto: CreateManufacturingPlantDto,
  ): Promise<ManufacturingPlant> {
    const manufacturingPlant = await this.manufacturingPlantRepository.create(
      createManufacturingPlantDto,
    );

    return this.manufacturingPlantRepository.save(manufacturingPlant);
  }

  findAll(queryManufacturingPlantDto: QueryManufacturingPlantDto) {
    const { name, page, limit } = queryManufacturingPlantDto;

    const options: FindManyOptions<ManufacturingPlant> = {
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
      },
      order: {
        id: 'DESC',
      },
    };

    return page && limit
      ? findPaginated(this.manufacturingPlantRepository, options, page, limit)
      : this.manufacturingPlantRepository.find(options);
  }

  async findOne(id: number, isActive = true): Promise<ManufacturingPlant> {
    const manufacturingPlant = await this.manufacturingPlantRepository.findOne({
      where: {
        id,
        ...(isActive && { isActive }),
      },
    });

    if (!manufacturingPlant) {
      throw new NotFoundException(`Planta con ID ${id} no encontrada`);
    }

    return manufacturingPlant;
  }

  async findOneByName(name: string): Promise<ManufacturingPlant> {
    const manufacturing = await this.manufacturingPlantRepository.findOne({
      where: {
        name,
        isActive: true,
      },
    });

    if (!manufacturing) {
      throw new NotFoundException(`Planta con nombre ${name} no encontrada`);
    }

    return manufacturing;
  }

  /**
   * Ids de las plantas activas con esos nombres, en una sola consulta.
   * Igual que llamar findOneByName por cada nombre: si alguno no existe
   * lanza el mismo NotFoundException.
   */
  async findIdsByNamesOrFail(names: string[]): Promise<number[]> {
    const plants = await this.findAllByNames(names);
    const idByName = new Map(plants.map(({ id, name }) => [name, id]));

    return names.map((name) => {
      const id = idByName.get(name);

      if (id === undefined) {
        throw new NotFoundException(`Planta con nombre ${name} no encontrada`);
      }

      return id;
    });
  }

  async findAllByNames(names: string[]): Promise<ManufacturingPlant[]> {
    return this.manufacturingPlantRepository.find({
      where: {
        name: In(names),
        isActive: true,
      },
    });
  }

  async update(
    id: number,
    updateManufacturingPlantDto: UpdateManufacturingPlantDto,
  ): Promise<ManufacturingPlant> {
    await this.findOne(id);

    const manufacturingPlant = await this.manufacturingPlantRepository.preload({
      id,
      ...updateManufacturingPlantDto,
    });

    return this.manufacturingPlantRepository.save(manufacturingPlant);
  }

  async remove(id: number): Promise<ManufacturingPlant> {
    await this.findOne(id);

    await this.manufacturingPlantRepository.update(id, {
      isActive: false,
    });

    return this.manufacturingPlantRepository.findOne({
      where: {
        id,
        isActive: false,
      },
    });
  }

  async getColombianPlantsIds(): Promise<number[]> {
    const colombianPlants = await this.manufacturingPlantRepository.find({
      where: {
        country: {
          name: 'Colombia',
        },
        isActive: true,
      },
    });

    return colombianPlants.map((plant) => plant.id);
  }
}
