import { catalogIncludesInactive } from '../shared/utils/catalog-visibility.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { findActiveByPlantQualifiedNames } from '../shared/utils/plant-qualified-names.js';

import { type FindManyOptions, ILike, In, Repository } from 'typeorm';
import { findPaginated } from '../shared/utils/index.js';

import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { Processes } from './entities/processes.entity.js';
import {
  CreateProcessesDto,
  QueryProcessesDto,
  UpdateProcessesDto,
} from './dto/index.js';
import { buildFindOrder } from '../shared/utils/sort.js';
import {
  PROCESS_DEFAULT_SORT,
  PROCESS_SORT_COLUMNS,
} from './dto/query-processes.dto.js';

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
    const includeInactive = catalogIncludesInactive(
      queryProcessesDto.includeInactive,
    );
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
        ...(!includeInactive && { isActive: true }),
        ...(name && { name: ILike(`%${name}%`) }),
        ...(manufacturingPlantIds.length
          ? {
              manufacturingPlant: {
                id: In(manufacturingPlantIds),
                ...(!includeInactive && { isActive: true }),
              },
            }
          : {
              manufacturingPlant: {
                ...(!includeInactive && { isActive: true }),
              },
            }),
      },
      relations: ['manufacturingPlant'],
      order: buildFindOrder(
        PROCESS_SORT_COLUMNS,
        queryProcessesDto,
        PROCESS_DEFAULT_SORT,
      ),
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
      throw new NotFoundException(`Proceso #${id} no encontrado`);
    }

    return processes;
  }

  /** Procesos activos por "Planta - Proceso", en una sola consulta. */
  findAllByManufacturingPlantNames(names: string[]): Promise<Processes[]> {
    return findActiveByPlantQualifiedNames(this.processesRepository, names);
  }

  async update(
    id: number,
    updateProcessesDto: UpdateProcessesDto,
  ): Promise<Processes> {
    const current = await this.findOne(id);

    // Sin planta se conserva la actual (antes findOne(undefined) devolvía
    // cualquier planta).
    const manufacturingPlant = updateProcessesDto.manufacturingPlantId
      ? await this.manufacturingPlantsService.findOne(
          updateProcessesDto.manufacturingPlantId,
        )
      : current.manufacturingPlant;

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
