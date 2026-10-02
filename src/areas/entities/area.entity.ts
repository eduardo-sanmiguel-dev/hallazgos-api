import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
  Relation,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { Zone } from 'zones/entities/zone.entity';
import { User } from 'users/entities/user.entity';

@Index(['name', 'manufacturingPlant'], { unique: true })
@Entity({ name: 'areas' })
@ObjectType()
export class Area {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column()
  @Field(() => String)
  name: string;

  @Column({ default: true })
  @Field(() => Boolean)
  isActive: boolean;

  @Column({ type: 'integer', nullable: true })
  coordinateX?: number | null;

  @Column({ type: 'integer', nullable: true })
  coordinateY?: number | null;

  @Column({ type: 'double precision', nullable: true })
  zoomLevel?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  createdBy: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  updatedBy?: Relation<User>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.areas,
  )
  manufacturingPlant: Relation<ManufacturingPlant>;

  @OneToMany(() => Zone, (zone) => zone.area)
  zones: Relation<Zone[]>;
}
