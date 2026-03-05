import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';

import { RulesOfLife } from './rules-of-life.entity';
import { AreaOfBehavior } from './areas-of-behavior';
import { Ics } from 'ics/entities/ics.entity';

@Entity({ name: 'standards_of_behavior' })
export class StandardOfBehavior {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => RulesOfLife, (rulesOfLife) => rulesOfLife.standards)
  rulesOfLife: RulesOfLife;

  @ManyToMany(
    () => AreaOfBehavior,
    (areaOfBehavior) => areaOfBehavior.standards,
  )
  @JoinTable({
    name: 'standard_area_of_behavior',
  })
  areas: AreaOfBehavior[];

  @OneToMany(() => Ics, (ics) => ics.standardOfBehavior)
  ics: Ics[];
}
