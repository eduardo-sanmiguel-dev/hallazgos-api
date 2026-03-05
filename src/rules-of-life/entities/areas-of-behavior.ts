import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';

import { StandardOfBehavior } from './standard-of-behavior';
import { Ics } from 'ics/entities/ics.entity';

@Entity({ name: 'areas_of_behavior' })
export class AreaOfBehavior {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  updatedAt: Date;

  @ManyToMany(
    () => StandardOfBehavior,
    (standardOfBehavior) => standardOfBehavior.areas,
  )
  standards: StandardOfBehavior[];

  @OneToMany(() => Ics, (ics) => ics.areaOfBehavior)
  ics: Ics[];
}
