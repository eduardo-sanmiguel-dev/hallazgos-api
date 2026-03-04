import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateEquipmentDto, UpdateEquipmentDto } from './dto';
import { Equipment, EquipmentCostHistory } from './entities';

@Injectable()
export class EquipmentsService {
  constructor(
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
    @InjectRepository(EquipmentCostHistory)
    private readonly equipmentCostHistoryRepository: Repository<EquipmentCostHistory>,
  ) {}

  create(createEquipmentDto: CreateEquipmentDto) {
    this.equipmentCostHistoryRepository;
    return createEquipmentDto;
  }

  async seed() {
    return {
      message: 'Equipments seeded successfully',
    };
  }

  findAll(manufacturingPlantId: number) {
    return this.equipmentRepository.find({
      where: {
        isActive: true,
        manufacturingPlant: {
          id: manufacturingPlantId,
        },
      },
      order: {
        name: 'ASC',
      },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} equipment`;
  }

  update(id: number, updateEquipmentDto: UpdateEquipmentDto) {
    return { id, updateEquipmentDto };
  }

  remove(id: number) {
    return `This action removes a #${id} equipment`;
  }
}
