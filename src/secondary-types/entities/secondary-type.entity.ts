import { Field, ID, ObjectType } from '@nestjs/graphql';

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { MainType } from 'main-types/entities/main-type.entity';
import { Evidence } from 'evidences/entities/evidence.entity';

@Entity()
@ObjectType()
export class SecondaryType {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column({ unique: true })
  @Field(() => String)
  name: string;

  @Column({ default: true })
  @Field(() => Boolean, {
    defaultValue: true,
  })
  isActive: boolean;

  @CreateDateColumn()
  @Field(() => Date)
  createdAt: Date;

  @UpdateDateColumn()
  @Field(() => Date)
  updatedAt: Date;

  @ManyToOne(() => MainType, (mainType) => mainType.secondaryTypes)
  @Field(() => MainType)
  mainType: MainType;

  @OneToMany(() => Evidence, (evidence) => evidence.secondaryType)
  @Field(() => [Evidence])
  evidences: Evidence[];
}
