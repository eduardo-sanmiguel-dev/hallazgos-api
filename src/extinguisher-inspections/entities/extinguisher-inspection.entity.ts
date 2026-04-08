import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { ExtinguisherInspectionEvaluation } from './extinguisher-inspection-evaluation.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { User } from 'users/entities/user.entity';

@Entity({ name: 'extinguisher_inspections' })
export class ExtinguisherInspection {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  responsible: User;

  @Column({ type: 'date' })
  inspectionDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User)
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  updatedBy?: User;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.extinguisherInspections,
  )
  manufacturingPlant: ManufacturingPlant;

  @OneToMany(
    () => ExtinguisherInspectionEvaluation,
    (extinguisherInspectionEvaluation) =>
      extinguisherInspectionEvaluation.extinguisherInspection,
  )
  evaluations: ExtinguisherInspectionEvaluation[];
}
