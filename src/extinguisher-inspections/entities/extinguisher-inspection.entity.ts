import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  type Relation,
  Index,
} from 'typeorm';

import { ExtinguisherInspectionEvaluation } from './extinguisher-inspection-evaluation.entity.js';
import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'extinguisher_inspections' })
export class ExtinguisherInspection {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  responsible: Relation<User>;

  @Column({ type: 'date' })
  inspectionDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User)
  createdBy: Relation<User>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  updatedBy?: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.extinguisherInspections,
  )
  @Index('IDX_extinguisher_inspections_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;

  @OneToMany(
    () => ExtinguisherInspectionEvaluation,
    (extinguisherInspectionEvaluation) =>
      extinguisherInspectionEvaluation.extinguisherInspection,
  )
  evaluations: Relation<ExtinguisherInspectionEvaluation[]>;
}
