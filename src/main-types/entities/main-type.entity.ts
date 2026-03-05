import { Field, ID, ObjectType } from '@nestjs/graphql';

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { SecondaryType } from 'secondary-types/entities/secondary-type.entity';
import { Evidence } from 'evidences/entities/evidence.entity';

@Entity()
@ObjectType()
export class MainType {
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

  @OneToMany(() => SecondaryType, (secondaryType) => secondaryType.mainType)
  @Field(() => [SecondaryType])
  secondaryTypes: SecondaryType[];

  @OneToMany(() => Evidence, (evidence) => evidence.mainType)
  @Field(() => [Evidence])
  evidences: Evidence[];
}
