import { Field, ID, ObjectType } from '@nestjs/graphql';

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';

import { Evidence } from 'evidences/entities/evidence.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { User } from 'users/entities/user.entity';

@Entity({ name: 'processes' })
@Index(['name', 'manufacturingPlant'], { unique: true })
@ObjectType()
export class Processes {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column()
  @Field(() => String)
  name: string;

  @Column({ default: true })
  @Field(() => Boolean)
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  //@Field(() => Date)
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  //@Field(() => Date)
  updatedAt: Date;

  @OneToMany(() => Evidence, (evidence) => evidence.zone)
  //@Field(() => [Evidence])
  evidences: Evidence[];

  @ManyToOne(() => User, (user) => user.processes)
  //@Field(() => User)
  user: User;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.zones,
  )
  //@Field(() => ManufacturingPlant)
  manufacturingPlant: ManufacturingPlant;
}
