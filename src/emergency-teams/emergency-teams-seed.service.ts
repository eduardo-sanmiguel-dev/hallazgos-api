import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import {
  EmergencyTeam,
  ExtinguisherType,
} from './entities/emergency-team.entity';
import { User } from 'users/entities/user.entity';

@Injectable()
export class EmergencyTeamsSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmergencyTeamsSeedService.name);

  private readonly manufacturingPlantId = 2;
  private readonly createdById = 2;

  private readonly seedData: Array<{
    location: string;
    extinguisherNumber: string;
    typeOfExtinguisher: string;
    capacity: string;
  }> = [
    {
      location: 'Caseta de vigilancia 1',
      extinguisherNumber: '1',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Cuarto de maquinas',
      extinguisherNumber: '2',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'cuarto de maq afuera',
      extinguisherNumber: '3',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Tanques',
      extinguisherNumber: '4',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Hidro',
      extinguisherNumber: '5',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Recepción',
      extinguisherNumber: '6',
      typeOfExtinguisher: 'CO2',
      capacity: '2.5',
    },
    {
      location: 'Sala alebrije',
      extinguisherNumber: '7',
      typeOfExtinguisher: 'CO2',
      capacity: '2.5',
    },
    {
      location: 'Sala de juntas P.A',
      extinguisherNumber: '8',
      typeOfExtinguisher: 'CO2',
      capacity: '2.5',
    },
    {
      location: 'Jefatura de compras',
      extinguisherNumber: '9',
      typeOfExtinguisher: 'CO2',
      capacity: '2.5',
    },
    {
      location: 'Jefatura de gestión',
      extinguisherNumber: '10',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Sala de capacitación',
      extinguisherNumber: '11',
      typeOfExtinguisher: 'CO2',
      capacity: '2.5',
    },
    {
      location: 'SITE',
      extinguisherNumber: '12',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Acceso planta',
      extinguisherNumber: '13',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Pasillo gris',
      extinguisherNumber: '14',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Comedor',
      extinguisherNumber: '15',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Comedor',
      extinguisherNumber: '16',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Acceso comedor',
      extinguisherNumber: '17',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Pasillo principal',
      extinguisherNumber: '18',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Laboratorio innovación',
      extinguisherNumber: '19',
      typeOfExtinguisher: 'PQS',
      capacity: '4.5',
    },
    {
      location: 'Lab fisico quimico',
      extinguisherNumber: '20',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Pasillo principal',
      extinguisherNumber: '21',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Almacen troqueles',
      extinguisherNumber: '22',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Almacen repuestos',
      extinguisherNumber: '23',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Tableros electricos',
      extinguisherNumber: '24',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Pasillo principal',
      extinguisherNumber: '25',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Pasillo principal',
      extinguisherNumber: '26',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Sistema omosis',
      extinguisherNumber: '27',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Pasillo principal',
      extinguisherNumber: '28',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Making PB',
      extinguisherNumber: '29',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Pasillo MP',
      extinguisherNumber: '30',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Making 2 PB',
      extinguisherNumber: '31',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Making 1 PB',
      extinguisherNumber: '32',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Pasillo MP',
      extinguisherNumber: '33',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Pasillo MP',
      extinguisherNumber: '34',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Liquidos 1',
      extinguisherNumber: '35',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'liquidos 1',
      extinguisherNumber: '36',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'liquidos 2',
      extinguisherNumber: '37',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'liquidos 2',
      extinguisherNumber: '38',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'liquidos 3',
      extinguisherNumber: '39',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'liquidos 3',
      extinguisherNumber: '40',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'liquidos 4',
      extinguisherNumber: '41',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'prepesas MK 4',
      extinguisherNumber: '42',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Making 3 PA',
      extinguisherNumber: '43',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Making 2 PA',
      extinguisherNumber: '44',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'Making 1 PA',
      extinguisherNumber: '45',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'caldera',
      extinguisherNumber: '46',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'caldera',
      extinguisherNumber: '47',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'empaque',
      extinguisherNumber: '48',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Almacen retenciones',
      extinguisherNumber: '49',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'oficina almacen',
      extinguisherNumber: '50',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'almacen ',
      extinguisherNumber: '51',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'anden 3',
      extinguisherNumber: '52',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'Cortina',
      extinguisherNumber: '53',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'almacen',
      extinguisherNumber: '54',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'almacen pasillo L-K',
      extinguisherNumber: '55',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'pasillo almacen',
      extinguisherNumber: '56',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'almacen temporal',
      extinguisherNumber: '57',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'almacen temporal',
      extinguisherNumber: '58',
      typeOfExtinguisher: 'PQS',
      capacity: '10',
    },
    {
      location: 'almacen',
      extinguisherNumber: '59',
      typeOfExtinguisher: 'PQS',
      capacity: '10',
    },
    {
      location: 'pasillo virgen',
      extinguisherNumber: '60',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'pasillo virgen',
      extinguisherNumber: '61',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'subestacion',
      extinguisherNumber: '62',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'subestacion',
      extinguisherNumber: '63',
      typeOfExtinguisher: 'CO2',
      capacity: '4.5',
    },
    {
      location: 'cuarto de montacargas',
      extinguisherNumber: '64',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'caseta vigilancia 2',
      extinguisherNumber: '65',
      typeOfExtinguisher: 'CO2',
      capacity: '2.5',
    },
    {
      location: 'caseta vigilancia 2',
      extinguisherNumber: '66',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'montacargas crown1',
      extinguisherNumber: '67',
      typeOfExtinguisher: 'PQS',
      capacity: '1',
    },
    {
      location: 'montacargas crown 2',
      extinguisherNumber: '68',
      typeOfExtinguisher: 'PQS',
      capacity: '1',
    },
    {
      location: 'patineta',
      extinguisherNumber: '69',
      typeOfExtinguisher: 'PQS',
      capacity: '1',
    },
    {
      location: 'reserva',
      extinguisherNumber: '70',
      typeOfExtinguisher: 'PQS',
      capacity: '6',
    },
    {
      location: 'reserva',
      extinguisherNumber: '71',
      typeOfExtinguisher: 'PQS',
      capacity: '4.5',
    },
  ];

  constructor(
    @InjectRepository(EmergencyTeam)
    private readonly emergencyTeamRepository: Repository<EmergencyTeam>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed() {
    let createdCount = 0;
    let skippedCount = 0;

    for (const item of this.seedData) {
      const extinguisherNumber = Number(item.extinguisherNumber);
      const capacity = Number(item.capacity);
      const typeOfExtinguisher = item.typeOfExtinguisher as ExtinguisherType;

      if (Number.isNaN(extinguisherNumber) || Number.isNaN(capacity)) {
        this.logger.warn(
          `Registro omitido por valores numericos invalidos: ${item.location}`,
        );
        continue;
      }

      if (!Object.values(ExtinguisherType).includes(typeOfExtinguisher)) {
        this.logger.warn(
          `Registro omitido por tipo de extintor invalido: ${item.typeOfExtinguisher}`,
        );
        continue;
      }

      const exists = await this.emergencyTeamRepository.findOne({
        where: {
          location: item.location,
          extinguisherNumber,
          typeOfExtinguisher,
          capacity,
          manufacturingPlant: { id: this.manufacturingPlantId },
        },
      });

      if (exists) {
        skippedCount += 1;
        continue;
      }

      const emergencyTeam = this.emergencyTeamRepository.create({
        location: item.location,
        extinguisherNumber,
        typeOfExtinguisher,
        capacity,
        manufacturingPlant: { id: this.manufacturingPlantId },
        createdBy: { id: this.createdById } as User,
      });

      await this.emergencyTeamRepository.save(emergencyTeam);
      createdCount += 1;
    }

    this.logger.log(
      `EmergencyTeams seed ejecutado. Creados: ${createdCount}, existentes: ${skippedCount}`,
    );
  }
}
