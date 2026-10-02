import {
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  Index,
  OneToMany,
  Relation,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { TrainingGuideEvaluation } from './training-guide-evaluation.entity';
import { Employee, EmployeeArea, EmployeePosition } from 'employees/entities';
import { User } from 'users/entities/user.entity';

@Entity()
@Index(['employee', 'position'], { unique: true })
export class TrainingGuide {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'date',
    transformer: {
      from: (value: string) => (value ? new Date(value) : null),
      to: (value: Date) => (value ? value.toISOString().slice(0, 10) : null),
    },
    name: 'start_date',
  })
  startDate: Date;

  @Column({ nullable: true, name: 'signature_employee' })
  signatureEmployee: string;

  @Column({ type: 'timestamptz', nullable: true })
  signatureEmployeeDate: Date;

  @Column({ nullable: true, name: 'signature_area_manager' })
  signatureAreaManager: string;

  @Column({ type: 'timestamptz', nullable: true })
  signatureAreaManagerDate: Date;

  @Column({ nullable: true, name: 'signature_human_resource_manager' })
  signatureHumanResourceManager: string;

  @Column({ type: 'timestamptz', nullable: true })
  signatureHumanResourceManagerDate: Date;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    name: 'percentage_of_compliance',
  })
  percentageOfCompliance: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.configTgCreated)
  createdBy: Relation<User>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.configTgUpdated)
  updatedBy: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Employee, (employee) => employee.trainingGuides)
  employee: Relation<Employee>;

  @ManyToOne(
    () => EmployeePosition,
    (employeePosition) => employeePosition.trainingGuides,
  )
  position: Relation<EmployeePosition>;

  @OneToMany(
    () => TrainingGuideEvaluation,
    (trainingGuideEvaluation) =>
      trainingGuideEvaluation.trainingGuideEvaluation,
    {
      cascade: true,
    },
  )
  evaluations: Relation<TrainingGuideEvaluation[]>;

  @ManyToOne(() => User, (user) => user.trainingGuidesAreaManager)
  areaManager: Relation<User>;

  @ManyToOne(() => User, (user) => user.trainingGuidesHumanResourceManager)
  humanResourceManager: Relation<User>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.trainingGuides,
  )
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => EmployeeArea, (area) => area.trainingGuides)
  area: Relation<EmployeeArea>;
}
