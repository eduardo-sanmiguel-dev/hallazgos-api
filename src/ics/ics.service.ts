import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { type FindOptionsWhere, ILike, Repository, In } from 'typeorm';

import { scopePlantIds } from '../shared/utils/plant-scope.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { RulesOfLife } from '../rules-of-life/entities/index.js';
import { CreateIcsDto, FiltersIcsDto, UpdateIcsDto } from './dto/index.js';
import { Ics } from './entities/ics.entity.js';

@Injectable()
export class IcsService {
  private readonly relations: string[] = [
    'createdBy',
    'manufacturingPlant',
    'ruleOfLife',
    'standardOfBehavior',
    'areaOfBehavior',
    'employees',
  ];

  constructor(
    private readonly requestContext: RequestContextService,
    @InjectRepository(Ics)
    private readonly icsRepository: Repository<Ics>,
    @InjectRepository(RulesOfLife)
    private readonly rulesOfLifeRepository: Repository<RulesOfLife>,
  ) {}

  async create(createIcsDto: CreateIcsDto, file: Express.Multer.File) {
    const createdBy = this.requestContext.userId;

    const {
      description,
      manufacturingPlantId,
      totalPeople,
      ruleOfLifeId,
      standardOfBehaviorId,
      areaOfBehaviorId,
      employeesIds,
    } = createIcsDto;

    this.requestContext.assertManufacturingPlant(manufacturingPlantId);
    // Validate the active hierarchy even for clients with an old catalog/draft.
    const rule = await this.rulesOfLifeRepository.findOne({
      where: { id: ruleOfLifeId, isActive: true },
      relations: ['standards', 'standards.areas'],
    });
    if (!rule)
      throw new NotFoundException(
        'La regla de vida seleccionada ya no está disponible.',
      );
    const standard = standardOfBehaviorId
      ? rule.standards.find(
          (item) => item.id === Number(standardOfBehaviorId) && item.isActive,
        )
      : undefined;
    if (standardOfBehaviorId && !standard)
      throw new BadRequestException(
        'El estándar seleccionado no está activo o no pertenece a la regla de vida.',
      );
    if (areaOfBehaviorId && !standard)
      throw new BadRequestException(
        'Selecciona un estándar válido antes de elegir el área de comportamiento.',
      );
    if (
      areaOfBehaviorId &&
      !standard.areas.some(
        (item) => item.id === Number(areaOfBehaviorId) && item.isActive,
      )
    )
      throw new BadRequestException(
        'El área seleccionada no está activa o no pertenece al estándar.',
      );
    const ids = [...new Set(employeesIds)];
    const count = await this.icsRepository.manager.count(Employee, {
      where: {
        id: In(ids),
        isActive: true,
        manufacturingPlants: { id: manufacturingPlantId },
      },
    });
    if (count !== ids.length)
      throw new NotFoundException(
        'Uno o más colaboradores no pertenecen a la planta seleccionada.',
      );
    let imgEvidence = '';

    if (file) {
      imgEvidence = file.filename;
    }

    const totalIncorrectPeople = employeesIds.length;

    // Antes se guardaban personas correctas y porcentaje negativos.
    if (totalIncorrectPeople > totalPeople) {
      throw new BadRequestException(
        'Las personas que no cumplen con el estándar no pueden ser más que las personas totales.',
      );
    }

    const totalCorrectPeople = totalPeople - totalIncorrectPeople;

    return this.icsRepository.save({
      description,
      totalPeople,
      totalCorrectPeople,
      totalIncorrectPeople: totalIncorrectPeople,
      icsPercentage: Number(
        ((totalCorrectPeople / totalPeople) * 100).toFixed(2),
      ),
      ruleOfLife: {
        id: ruleOfLifeId,
      },
      ...(standardOfBehaviorId && {
        standardOfBehavior: { id: standardOfBehaviorId },
      }),
      ...(areaOfBehaviorId && {
        areaOfBehavior: { id: areaOfBehaviorId },
      }),
      createdBy: {
        id: createdBy,
      },
      manufacturingPlant: {
        id: manufacturingPlantId,
      },
      imgEvidence,
      employees: employeesIds.map((id) => ({ id })),
    });
  }

  async catalogs() {
    const rules = await this.rulesOfLifeRepository.find({
      where: { isActive: true },
      relations: ['standards', 'standards.areas'],
      order: { order: 'ASC' },
    });
    return rules.map((rule) => ({
      ...rule,
      standards: rule.standards
        .filter((standard) => standard.isActive)
        .map((standard) => ({
          ...standard,
          areas: standard.areas.filter((area) => area.isActive),
        })),
    }));
  }

  async findAll(filtersIcsDto: FiltersIcsDto) {
    const { manufacturingPlantId, areaOfBehaviorId, page, limit } =
      filtersIcsDto;
    const search = (filtersIcsDto.name ?? '').trim();

    const base: FindOptionsWhere<Ics> = {
      isActive: true,
      manufacturingPlant: {
        id: In(
          scopePlantIds(
            this.requestContext.user.manufacturingPlants,
            manufacturingPlantId,
          ),
        ),
      },
      ...(areaOfBehaviorId && {
        areaOfBehavior: { id: Number(areaOfBehaviorId) },
      }),
    };

    // `name` busca por regla de vida o estándar de comportamiento (coincidencia parcial).
    const where: FindOptionsWhere<Ics>[] = search
      ? [
          { ...base, ruleOfLife: { name: ILike(`%${search}%`) } },
          { ...base, standardOfBehavior: { name: ILike(`%${search}%`) } },
        ]
      : [base];

    if (page === undefined || limit === undefined) {
      return this.icsRepository.find({
        where,
        relations: this.relations,
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    }

    const limitNumber = Number(limit);
    const isUnlimited = limitNumber === -1;

    const [data, count] = await this.icsRepository.findAndCount({
      where,
      relations: this.relations,
      order: { createdAt: 'DESC', id: 'DESC' },
      ...(!isUnlimited && {
        take: limitNumber,
        skip: (Number(page) - 1) * limitNumber,
      }),
    });

    return { data, count };
  }

  async findOne(id: number) {
    const ics = await this.icsRepository.findOne({
      where: {
        id,
        isActive: true,
        manufacturingPlant: {
          id: In(this.requestContext.manufacturingPlantIds),
        },
      },
      relations: this.relations,
    });

    if (!ics) {
      throw new NotFoundException(`Registro de ICS #${id} no encontrado`);
    }

    return ics;
  }

  async update(id: number, updateIcDto: UpdateIcsDto) {
    await this.findOne(id);
    return { id, updateIcDto };
  }

  async remove(id: number) {
    const ics = await this.findOne(id);
    await this.icsRepository.update(id, {
      isActive: false,
      updatedAt: new Date(),
    });

    return ics;
  }
}
