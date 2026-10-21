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
  type Relation,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Evidence } from '../../evidences/entities/evidence.entity.js';
import { Ciael } from '../../ciaels/entities/ciael.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Area } from '../../areas/entities/area.entity.js';

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
  evidences: Relation<Evidence[]>;

  @ManyToOne(() => User)
  createdBy: Relation<User>;

  @ManyToOne(() => User, { nullable: true })
  updatedBy?: Relation<User>;

  @ManyToOne(() => User, (user) => user.zones)
  //@Field(() => User)
  user: Relation<User>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.zones,
  )
  //@Field(() => ManufacturingPlant)
  @Index('IDX_zones_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => Area, (area) => area.zones)
  @Field(() => Area, { nullable: true })
  @Index('IDX_zones_areaId')
  area: Relation<Area>;

  @OneToMany(() => Ciael, (ciael) => ciael.zone)
  ciaels: Relation<Ciael[]>;
}
