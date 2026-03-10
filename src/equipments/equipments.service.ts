import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { ILike, In, Repository } from 'typeorm';
import { Request } from 'express';

import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto';
import { Equipment, EquipmentCostHistory } from './entities';
import { User } from 'users/entities/user.entity';
import { getColombiaNow } from '@shared/utils';

@Injectable()
export class EquipmentsService {
  private readonly relations: string[] = [
    'createdBy',
    'updatedBy',
    'costHistory',
    'manufacturingPlant',
  ];

  constructor(
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
    @InjectRepository(EquipmentCostHistory)
    private readonly equipmentCostHistoryRepository: Repository<EquipmentCostHistory>,
    @Inject(REQUEST)
    private readonly request: Request,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
  ) {}

  async createdAt(manufacturingPlantId: number): Promise<Date> {
    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();

    const createdAt = getColombiaNow(colombianIds, manufacturingPlantId);

    return createdAt;
  }

  async create(createEquipmentDto: CreateEquipmentDto) {
    const createdBy = this.request['user'] as User;

    const { name, deliveryFrequency, manufacturingPlantId, price } =
      createEquipmentDto;

    const createdAt = await this.createdAt(manufacturingPlantId);

    const equipmentNew = this.equipmentRepository.create({
      name,
      deliveryFrequency,
      createdBy,
      manufacturingPlant: { id: manufacturingPlantId },
      createdAt,
      updatedAt: createdAt,
    });

    const equipment = await this.equipmentRepository.save(equipmentNew);

    if (price) {
      await this.equipmentCostHistoryRepository.save({
        equipment,
        price,
        createdBy,
        createdAt,
        captureDate: createdAt,
      });
    }

    return this.findOne(equipment.id);
  }

  async seed() {
    return {
      message: 'Equipments seeded successfully',
    };
  }

  findAll(manufacturingPlantId: number, name: string) {
    const user = this.request['user'] as User;
    let manufacturingPlantsIds = user.manufacturingPlants.map((mp) => mp.id);

    if (manufacturingPlantId) {
      manufacturingPlantsIds = manufacturingPlantsIds.filter(
        (id) => id === manufacturingPlantId,
      );
    }

    return this.equipmentRepository.find({
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
        manufacturingPlant: {
          id: In(manufacturingPlantsIds),
        },
      },
      relations: this.relations,
      order: {
        name: 'ASC',
        costHistory: {
          createdAt: 'DESC',
        },
      },
    });
  }

  async findOne(id: number) {
    const equipment = await this.equipmentRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
      order: {
        costHistory: {
          createdAt: 'DESC',
        },
      },
    });

    if (!equipment) {
      throw new NotFoundException(`Equipo con id ${id} no encontrado.`);
    }

    return equipment;
  }

  async update(id: number, updateEquipmentDto: UpdateEquipmentDto) {
    const updatedBy = this.request['user'] as User;

    const { price, manufacturingPlantId } = updateEquipmentDto;

    const equipment = await this.findOne(id);

    const updatedAt = await this.createdAt(manufacturingPlantId);

    Object.assign(equipment, updateEquipmentDto, {
      updatedAt,
      updatedBy,
    });

    const equipmentUpdated = await this.equipmentRepository.save(equipment);

    if (price) {
      await this.equipmentCostHistoryRepository.save({
        equipment: equipmentUpdated,
        price,
        createdBy: updatedBy,
        createdAt: updatedAt,
        captureDate: updatedAt,
      });
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const updatedBy = this.request['user'] as User;

    const equipment = await this.findOne(id);

    const updatedAt = await this.createdAt(equipment.manufacturingPlant.id);

    equipment.isActive = false;
    equipment.updatedAt = updatedAt;
    equipment.updatedBy = updatedBy;

    return this.equipmentRepository.save(equipment);
  }
}
