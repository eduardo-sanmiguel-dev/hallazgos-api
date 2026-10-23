import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { ROLE_ADMINISTRADOR } from '../shared/constants/index.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from './entities/user.entity.js';

const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1'];
export const E2E_USER_NAME = 'Usuario pruebas e2e';

export type E2eUserSeedResult = 'skipped' | 'created' | 'updated' | 'ok';

/**
 * Usuario de las pruebas e2e del UI (Administrador, todas las plantas).
 * SOLO en desarrollo y con base local: al levantar la API lo crea si no
 * existe (p. ej. tras restaurar la base desde producción) y, si existe, le
 * corrige contraseña, rol, estado y plantas. Credenciales en .env.development
 * (E2E_EMAIL / E2E_PASSWORD), las mismas de hallazgos-ui/e2e/.env.e2e.
 * Un fallo aquí nunca impide que la API arranque.
 */
@Injectable()
export class E2eUserSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(E2eUserSeedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ManufacturingPlant)
    private readonly plantRepository: Repository<ManufacturingPlant>,
  ) {}

  async onApplicationBootstrap() {
    try {
      const result = await this.ensureE2eUser();
      if (result === 'created' || result === 'updated') {
        this.logger.log(
          `Usuario de pruebas e2e ${result === 'created' ? 'creado' : 'actualizado'}.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo preparar el usuario e2e: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async ensureE2eUser(): Promise<E2eUserSeedResult> {
    if (this.configService.get<string>('environment') !== 'development') {
      return 'skipped';
    }
    if (
      !LOCAL_DB_HOSTS.includes(this.configService.get<string>('db.host') ?? '')
    ) {
      return 'skipped';
    }

    const email = this.configService.get<string>('E2E_EMAIL') ?? '';
    const password = this.configService.get<string>('E2E_PASSWORD') ?? '';
    // Sin credenciales no hay nada que hacer; incompletas o inseguras, se avisa.
    if (!email && !password) return 'skipped';
    if (!/@hallazgos\.test$/.test(email) || password.length < 16) {
      this.logger.warn(
        'E2E_EMAIL debe ser @hallazgos.test y E2E_PASSWORD de 16+ caracteres; no se crea el usuario e2e.',
      );
      return 'skipped';
    }

    const plants = await this.plantRepository.find();
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'name', 'email', 'password', 'role', 'isActive'],
      relations: ['manufacturingPlants'],
    });

    if (!user) {
      // La contraseña se cifra en el @BeforeInsert de User.
      await this.userRepository.save(
        this.userRepository.create({
          name: E2E_USER_NAME,
          email,
          password,
          role: ROLE_ADMINISTRADOR,
          isActive: true,
          manufacturingPlants: plants,
        }),
      );
      return 'created';
    }

    let changed = false;
    if (!(await argon2.verify(user.password, password).catch(() => false))) {
      user.password = await argon2.hash(password);
      changed = true;
    }
    if (user.role !== ROLE_ADMINISTRADOR || !user.isActive) {
      user.role = ROLE_ADMINISTRADOR;
      user.isActive = true;
      changed = true;
    }
    const assigned = new Set(user.manufacturingPlants.map(({ id }) => id));
    if (plants.some(({ id }) => !assigned.has(id))) {
      user.manufacturingPlants = plants;
      changed = true;
    }

    if (!changed) return 'ok';
    await this.userRepository.save(user);
    return 'updated';
  }
}
