import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { ILike, In, Repository } from 'typeorm';
import { Request } from 'express';

import { CreateEquipmentDto, UpdateEquipmentDto } from './dto';
import { Equipment } from './entities';
import { User } from 'users/entities/user.entity';

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
    //@InjectRepository(EquipmentCostHistory)
    //private readonly equipmentCostHistoryRepository: Repository<EquipmentCostHistory>,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  async create(createEquipmentDto: CreateEquipmentDto) {
    const createdBy = this.request['user'] as User;

    const { name, deliveryFrequency, manufacturingPlantId } =
      createEquipmentDto;

    const equipmentNew = this.equipmentRepository.create({
      name,
      deliveryFrequency,
      createdBy,
      manufacturingPlant: { id: manufacturingPlantId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const equipment = await this.equipmentRepository.save(equipmentNew);
    return equipment;
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
      },
    });
  }

  async findOne(id: number) {
    const equipment = await this.equipmentRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
    });

    if (!equipment) {
      throw new NotFoundException(`Equipo con id ${id} no encontrado.`);
    }

    return equipment;
  }

  async update(id: number, updateEquipmentDto: UpdateEquipmentDto) {
    const updatedBy = this.request['user'] as User;

    const equipment = await this.findOne(id);

    Object.assign(equipment, updateEquipmentDto, {
      updatedAt: new Date(),
      updatedBy,
    });

    return this.equipmentRepository.save(equipment);
  }

  async remove(id: number) {
    const equipment = await this.findOne(id);

    equipment.isActive = false;

    return this.equipmentRepository.save(equipment);
  }
}
