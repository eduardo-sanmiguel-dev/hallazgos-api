import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';

import { ExtinguisherType } from 'emergency-teams/entities/emergency-team.entity';
import { ExtinguisherInspection } from './extinguisher-inspection.entity';
import { User } from 'users/entities/user.entity';

export enum EvaluationValues {
  C = 'C',
  NC = 'NC',
  NA = 'NA',
}

@Entity({ name: 'extinguisher_inspection_evaluations' })
export class ExtinguisherInspectionEvaluation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 150,
  })
  location: string;

  @Column({ type: 'integer' })
  extinguisherNumber: number;

  @Column({
    type: 'enum',
    enum: ExtinguisherType,
  })
  typeOfExtinguisher: ExtinguisherType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  capacity: number;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  pressureManometer: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  valve: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  hose: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  cylinder: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  barrette: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  seal: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  cornet: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  access: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  support: EvaluationValues;

  @Column({
    type: 'enum',
    enum: EvaluationValues,
    default: EvaluationValues.C,
  })
  signaling: EvaluationValues;

  @Column({ type: 'date' })
  nextRechargeDate: Date;

  @Column({ type: 'date' })
  maintenanceDate: Date;

  @Column({ length: 500, nullable: true })
  observations: string;

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
    () => ExtinguisherInspection,
    (extinguisherInspection) => extinguisherInspection.evaluations,
  )
  extinguisherInspection: ExtinguisherInspection;
}
