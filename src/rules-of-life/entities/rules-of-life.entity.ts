import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { StandardOfBehavior } from './standard-of-behavior';
import { Ics } from 'ics/entities/ics.entity';

@Entity({ name: 'rules_of_life' })
export class RulesOfLife {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  name: string;

  @Column()
  order: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(
    () => StandardOfBehavior,
    (standardOfBehavior) => standardOfBehavior.rulesOfLife,
  )
  standards: StandardOfBehavior[];

  @OneToMany(() => Ics, (ics) => ics.ruleOfLife)
  ics: Ics[];
}
