import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { User } from 'users/entities/user.entity';
import { Employee } from 'employees/entities';
import {
  AreaOfBehavior,
  RulesOfLife,
  StandardOfBehavior,
} from 'rules-of-life/entities';

@Entity({ name: 'ics' })
export class Ics {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
  })
  description?: string;

  @Column({
    nullable: true,
  })
  imgEvidence?: string;

  @Column()
  totalPeople: number;

  @Column()
  totalCorrectPeople: number;

  @Column()
  totalIncorrectPeople: number;

  @Column({ type: 'float' })
  icsPercentage: number;

  @ManyToOne(() => User, (user) => user.ics)
  createdBy: User;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.ics,
  )
  manufacturingPlant: ManufacturingPlant;

  @ManyToOne(() => RulesOfLife, (rulesOfLife) => rulesOfLife.ics)
  ruleOfLife: RulesOfLife;

  @ManyToOne(
    () => StandardOfBehavior,
    (standardOfBehavior) => standardOfBehavior.ics,
  )
  standardOfBehavior: StandardOfBehavior;

  @ManyToOne(() => AreaOfBehavior, (areaOfBehavior) => areaOfBehavior.ics)
  areaOfBehavior: AreaOfBehavior;

  @ManyToMany(() => Employee, (employee) => employee.ics)
  @JoinTable({
    name: 'employees_ics',
  })
  employees: Employee[];
}
