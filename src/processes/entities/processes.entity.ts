import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
  type Relation,
} from 'typeorm';

import { Evidence } from '../../evidences/entities/evidence.entity.js';
import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'processes' })
@Index(['name', 'manufacturingPlant'], { unique: true })
export class Processes {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Evidence, (evidence) => evidence.zone)
  evidences: Relation<Evidence[]>;

  @ManyToOne(() => User, (user) => user.processes)
  user: Relation<User>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.zones,
  )
  @Index('IDX_processes_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;
}
