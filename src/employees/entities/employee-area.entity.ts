import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Relation,
} from 'typeorm';

import { Employee } from './employee.entity';
import { TrainingGuide } from 'training-guides/entities';

@Entity()
export class EmployeeArea {
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

  @OneToMany(() => Employee, (employee) => employee.area)
  employees: Relation<Employee[]>;

  @OneToMany(() => TrainingGuide, (trainingGuide) => trainingGuide.area)
  trainingGuides: Relation<TrainingGuide[]>;
}
