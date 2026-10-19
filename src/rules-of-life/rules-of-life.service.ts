import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { In, Repository } from 'typeorm';

import { AreaOfBehavior, RulesOfLife, StandardOfBehavior } from './entities';
import { CreateRulesOfLifeDto, UpdateRulesOfLifeDto } from './dto';

@Injectable()
export class RulesOfLifeService {
  constructor(
    @InjectRepository(RulesOfLife)
    private readonly rulesOfLifeRepository: Repository<RulesOfLife>,
    @InjectRepository(StandardOfBehavior)
    private readonly standardOfBehaviorRepository: Repository<StandardOfBehavior>,
    @InjectRepository(AreaOfBehavior)
    private readonly areaOfBehaviorRepository: Repository<AreaOfBehavior>,
  ) {}

  create(createRulesOfLifeDto: CreateRulesOfLifeDto) {
    return createRulesOfLifeDto;
  }

  async seed() {
    const areas = [
      'Almacen de repuestos ',
      'Bodegas',
      'Calderas',
      'Cold Process',
      'Ecofire',
      'Laboratorio Microbiología ',
      'Laboratorios',
      'Líquidos',
      'Mezclado',
      'Patio de tanques',
      'Saponificación y secado',
      'Solidos Fase 1',
      'Solidos Fase 2',
      'Solidos Fase 4',
      'Taller de infraestructura',
      'Taller Mantenimiento eléctrico',
      'Taller Mantenimiento mecánico',
      'Zona de blanqueo ',
    ];

    for (const area of areas) {
      const areaEntity = this.areaOfBehaviorRepository.create({ name: area });
      await this.areaOfBehaviorRepository.save(areaEntity);
    }

    const rulesOfLife = [
      { name: 'Seguridad como valor vital', order: 1, standard: [] },
      {
        name: 'Los lideres inspiran con su ejemplo',
        order: 2,
        standard: [
          {
            name: 'Comunica y reporte oportunamente  de condiciones y comportamientos inseguros',
            areas,
          },
          {
            name: 'Detiene o reprograma tareas cuando existe condiciones inseguras',
            areas,
          },
          {
            name: 'Fomenta actitudes seguras y la comunicación abierta sobre riesgos',
            areas,
          },
        ],
      },
      {
        name: 'Aplicamos los procedimientos y protocolos de seguridad',
        order: 3,
        standard: [
          {
            name: 'Usa adecuadamente las herramientas idóneas para la tarea que ejerce',
            areas,
          },
        ],
      },
      {
        name: 'Evaluamos los riesgos para actuar con seguridad',
        order: 4,
        standard: [],
      },
      {
        name: 'Mantenemos nuestro equipos en optimas condiciones ',
        order: 5,
        standard: [
          {
            name: 'Usa adecuadamente las guardas, sensores y sistemas de protección de las máquinas',
            areas: [
              'Solidos Fase 1',
              'Solidos Fase 2',
              'Solidos Fase 4',
              'Saponificación y secado',
              'Mezclado',
              'Líquidos',
            ],
          },
        ],
      },
      {
        name: 'Cuidamos de nuestra seguridad con el uso de EPP y equipo de seguridad',
        order: 6,
        standard: [
          {
            name: 'Usa adecuadamente los protectores auditivos',
            areas: [
              'Calderas',
              'Mezclado',
              'Patio de tanques',
              'Saponificación y secado',
              'Solidos Fase 1',
              'Solidos Fase 2',
              'Solidos Fase 4',
              'Taller Mantenimiento mecánico',
              'Zona de blanqueo ',
            ],
          },
          {
            name: 'Usa los guantes de manera correcta para el corte del producto defectuoso',
            areas: [
              'Líquidos',
              'Solidos Fase 1',
              'Solidos Fase 2',
              'Solidos Fase 4',
            ],
          },
          {
            name: 'Usa el calzado de seguridad de manera correcta con los cordones ajustados hasta el ultimo ojete',
            areas,
          },
          {
            name: 'Usa correctamente el casco de seguridad',
            areas: [
              'Saponificación y secado',
              'Patio de tanques',
              'Calderas',
              'Taller Mantenimiento eléctrico',
              'Taller Mantenimiento mecánico',
            ],
          },
          {
            name: 'Usa adecuadamente las gafas de seguridad',
            areas: [
              'Taller de infraestructura',
              'Taller Mantenimiento eléctrico',
              'Taller Mantenimiento mecánico',
            ],
          },
        ],
      },
      { name: 'Reportamos para mejorar', order: 7, standard: [] },
      {
        name: 'Garantizamos la seguridad aplicando las reglas de vida en tareas de alto riesgo',
        order: 8,
        standard: [
          {
            name: 'Cumple con procedimiento de bloqueo y etiquetado para realizar trabajos de intervención en equipos.',
            areas,
          },
        ],
      },
    ];

    for (const { name, order, standard } of rulesOfLife) {
      const ruleEntity = this.rulesOfLifeRepository.create({ name, order });
      await this.rulesOfLifeRepository.save(ruleEntity);

      for (const { name: nameStd, areas } of standard) {
        for (const areaName of areas || []) {
          const areaEntity = await this.areaOfBehaviorRepository.findOne({
            where: { name: areaName },
          });
          if (!areaEntity) {
            await this.areaOfBehaviorRepository.save(
              this.areaOfBehaviorRepository.create({ name: areaName }),
            );
          }
        }

        const currentAreas = await this.areaOfBehaviorRepository.find({
          where: { name: In(areas || []) },
        });

        const standardEntity = this.standardOfBehaviorRepository.create({
          name: nameStd,
          rulesOfLife: ruleEntity,
          areas: currentAreas,
        });
        await this.standardOfBehaviorRepository.save(standardEntity);
      }
    }

    return { message: 'Seeded successfully' };
  }

  findAll() {
    return `This action returns all rulesOfLife`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rulesOfLife`;
  }

  update(id: number, updateRulesOfLifeDto: UpdateRulesOfLifeDto) {
    return { id, updateRulesOfLifeDto };
  }

  remove(id: number) {
    return `This action removes a #${id} rulesOfLife`;
  }
}
