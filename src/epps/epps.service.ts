import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { Repository } from 'typeorm';
import { Request } from 'express';

import { CreateEppDto, UpdateEppDto } from './dto';
import { User } from 'users/entities/user.entity';
import { Equipment } from 'equipments/entities';
import { Epp, EppEquipment } from './entities';
import { Employee } from 'employees/entities';

@Injectable()
export class EppsService {
  private readonly relations: string[] = [
    'employee',
    'employee.position',
    'employee.area',
    'createBy',
    'equipments',
    'equipments.equipment',
  ];

  constructor(
    @InjectRepository(Epp)
    private readonly eppRepository: Repository<Epp>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(EppEquipment)
    private readonly eppEquipmentRepository: Repository<EppEquipment>,
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
  ) {}

  async create(createEppDto: CreateEppDto) {
    const createBy = this.request['user'] as User;

    const { employeeId, signature, equipments } = createEppDto;

    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found.`);
    }

    const epp = await this.eppRepository.save({
      employee,
      signature,
      createBy,
      creationDate: new Date(),
      updatedAt: new Date(),
    });

    for (const equipment of equipments) {
      const currentEquipment = await this.equipmentRepository.findOne({
        where: { id: equipment.id, isActive: true },
      });

      if (!currentEquipment) {
        throw new NotFoundException(
          `Equipment with ID ${equipment.id} not found.`,
        );
      }

      await this.eppEquipmentRepository.save({
        deliveryDate: new Date(),
        quantity: equipment.quantity,
        observations: equipment.observations,
        equipment: currentEquipment,
        epp,
        creationDate: new Date(),
        updatedAt: new Date(),
      });
    }

    return { message: 'EPP created successfully' };
  }

  async findEppsByEmployeeId(employeeId: number) {
    return this.eppRepository.find({
      where: {
        employee: {
          id: employeeId,
        },
        isActive: true,
      },
      relations: this.relations,
      order: {
        createdAt: 'ASC',
      },
    });
  }

  findAll(manufacturingPlantId: number) {
    return this.employeeRepository.find({
      where: {
        isActive: true,
        manufacturingPlants: {
          id: manufacturingPlantId,
        },
        epps: {
          isActive: true,
        },
      },
      relations: [
        'position',
        'area',
        'epps',
        'epps.createBy',
        'epps.equipments',
        'epps.equipments.equipment',
      ],
      order: {
        name: 'ASC',
      },
    });
  }

  async findOne(id: number) {
    const epp = await this.eppRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
    });

    if (!epp) {
      throw new NotFoundException(`EPP with ID ${id} not found.`);
    }

    return epp;
  }

  update(id: number, updateEppDto: UpdateEppDto) {
    return { id, updateEppDto };
  }

  remove(id: number) {
    return `This action removes a #${id} epp`;
  }
}
