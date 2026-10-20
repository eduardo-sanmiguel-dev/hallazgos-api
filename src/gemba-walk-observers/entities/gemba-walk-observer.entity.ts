import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Relation,
  Index,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { GembaWalkZone } from 'gemba-walk-zones/entities/gemba-walk-zone.entity';
import { User } from 'users/entities/user.entity';

@Entity({ name: 'gemba_walk_observers' })
export class GembaWalkObserver {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  createdBy: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  updatedBy?: Relation<User>;

  @ManyToOne(() => ManufacturingPlant)
  @Index('IDX_gemba_walk_observers_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => GembaWalkZone)
  gembaWalkZone: Relation<GembaWalkZone>;

  // Usuario del sistema que realiza los recorridos (acceso al módulo Gemba Walk).
  @ManyToOne(() => User)
  user: Relation<User>;
}
