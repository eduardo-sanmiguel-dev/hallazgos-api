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

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { Evidence } from 'evidences/entities/evidence.entity';
import { Ciael } from 'ciaels/entities/ciael.entity';
import { User } from 'users/entities/user.entity';
import { Area } from 'areas/entities/area.entity';

@Entity({ name: 'zones' })
@Index(['name', 'manufacturingPlant'], { unique: true })
@ObjectType()
export class Zone {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column()
  @Field(() => String)
  name: string;

  @Column({ default: true })
  @Field(() => Boolean)
  isActive: boolean;

  @CreateDateColumn()
  //@Field(() => Date)
  createdAt: Date;

  @UpdateDateColumn()
  //@Field(() => Date)
  updatedAt: Date;

  @OneToMany(() => Evidence, (evidence) => evidence.zone)
  //@Field(() => [Evidence])
  evidences: Evidence[];

  @ManyToOne(() => User, (user) => user.zones)
  //@Field(() => User)
  user: User;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.zones,
  )
  //@Field(() => ManufacturingPlant)
  manufacturingPlant: ManufacturingPlant;

  @ManyToOne(() => Area, (area) => area.zones)
  area: Area;

  @OneToMany(() => Ciael, (ciael) => ciael.zone)
  ciaels: Ciael[];
}
