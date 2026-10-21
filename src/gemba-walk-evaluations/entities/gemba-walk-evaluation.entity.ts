import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  type Relation,
  Index,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from '../../users/entities/user.entity.js';

// Concepto a evaluar en un recorrido (ej. SHE / "EPP" / descripción).
@Entity({ name: 'gemba_walk_evaluations' })
export class GembaWalkEvaluation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  area: string;

  @Column({ length: 30 })
  category: string;

  @Column({ type: 'text' })
  description: string;

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
  @Index('IDX_gemba_walk_evaluations_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;
}
