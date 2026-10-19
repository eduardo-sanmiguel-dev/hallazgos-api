import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FindManyOptions, ILike, In, Repository } from 'typeorm';
import { findPaginated } from 'shared/utils';

import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { Processes } from './entities/processes.entity';
import {
  CreateProcessesDto,
  QueryProcessesDto,
  UpdateProcessesDto,
} from './dto';

@Injectable()
export class ProcessesService {
  constructor(
    @InjectRepository(Processes)
    private readonly processesRepository: Repository<Processes>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
  ) {}

  async create(createProcessesDto: CreateProcessesDto): Promise<Processes> {
    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      createProcessesDto.manufacturingPlantId,
    );

    const processes = await this.processesRepository.create({
      ...createProcessesDto,
      manufacturingPlant,
    });

    return this.processesRepository.save(processes);
  }

  async findAll(queryProcessesDto: QueryProcessesDto) {
    const { name, manufacturingPlantId, manufacturingPlantNames, page, limit } =
      queryProcessesDto;

    const manufacturingPlantIds = [];

    if (manufacturingPlantId) {
      manufacturingPlantIds.push(manufacturingPlantId);
    } else if (manufacturingPlantNames?.length && !manufacturingPlantId) {
      // Una consulta para todos los nombres (antes una por nombre).
      manufacturingPlantIds.push(
        ...(await this.manufacturingPlantsService.findIdsByNamesOrFail(
          manufacturingPlantNames,
        )),
      );
    }

    const options: FindManyOptions<Processes> = {
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
        ...(manufacturingPlantIds.length
          ? {
              manufacturingPlant: {
                id: In(manufacturingPlantIds),
                isActive: true,
              },
            }
          : {
              manufacturingPlant: { isActive: true },
            }),
      },
      relations: ['manufacturingPlant'],
      order: {
        id: 'DESC',
      },
    };

    return page && limit
      ? findPaginated(this.processesRepository, options, page, limit)
      : this.processesRepository.find(options);
  }

  async findOne(id: number, isActive = true): Promise<Processes> {
    const processes = await this.processesRepository.findOne({
      where: {
        id,
        ...(isActive && { isActive }),
        manufacturingPlant: { isActive: true },
      },
      relations: ['manufacturingPlant'],
    });

    if (!processes) {
      throw new NotFoundException(`Planta con ID ${id} no encontrado`);
    }

    return processes;
  }

  async findAllByManufacturingPlantNames(
    names: string[],
  ): Promise<Processes[]> {
    const processes = [];

    for (let i = 0; i < names.length; i++) {
      const [manufacturingPlantName, processesName] = names[i].split(' - ');
      const process = await this.processesRepository.findOne({
        where: {
          name: processesName,
          isActive: true,
          manufacturingPlant: {
            name: manufacturingPlantName,
            isActive: true,
          },
        },
      });

      if (process) {
        processes.push(process);
      }
    }

    return processes;
  }

  async update(
    id: number,
    updateProcessesDto: UpdateProcessesDto,
  ): Promise<Processes> {
    await this.findOne(id);

    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      updateProcessesDto.manufacturingPlantId,
    );

    const process = await this.processesRepository.preload({
      id,
      ...updateProcessesDto,
      manufacturingPlant,
    });

    return this.processesRepository.save(process);
  }

  async remove(id: number): Promise<Processes> {
    await this.findOne(id);

    await this.processesRepository.update(id, {
      isActive: false,
    });

    return this.processesRepository.findOne({
      where: {
        id,
        isActive: false,
      },
    });
  }
}
