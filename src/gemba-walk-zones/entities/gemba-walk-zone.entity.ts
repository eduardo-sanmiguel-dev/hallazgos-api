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
import { User } from 'users/entities/user.entity';

@Entity({ name: 'gemba_walk_zones' })
export class GembaWalkZone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nameZone: string;

  @Column()
  nameLocation: string;

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
  @Index('IDX_gemba_walk_zones_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;
}
