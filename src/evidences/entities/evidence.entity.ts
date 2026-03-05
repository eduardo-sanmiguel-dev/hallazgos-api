import { Field, ID, ObjectType } from '@nestjs/graphql';

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { MainType } from 'main-types/entities/main-type.entity';
import { SecondaryType } from 'secondary-types/entities/secondary-type.entity';
import { Zone } from 'zones/entities/zone.entity';
import { User } from 'users/entities/user.entity';
import { Comment } from './comments.entity';
import { Processes } from 'processes/entities/processes.entity';

@Entity()
@ObjectType()
export class Evidence {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column()
  @Field(() => String)
  imgEvidence: string;

  @Column({ default: '' })
  @Field(() => String, {
    defaultValue: '',
  })
  imgSolution: string;

  @Column({ default: null })
  @Field(() => Date, {
    defaultValue: null,
    nullable: true,
  })
  @Index()
  solutionDate: Date;

  @Column({ default: '' })
  @Field(() => String, {
    defaultValue: '',
    nullable: true,
  })
  description: string;

  @Column({ default: '' })
  @Field(() => String, {
    defaultValue: '',
    nullable: true,
  })
  descriptionSolution: string;

  @Column()
  @Field(() => String)
  @Index()
  status: string;

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

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.evidences,
  )
  @Field(() => ManufacturingPlant)
  @Index()
  manufacturingPlant: ManufacturingPlant;

  @ManyToOne(() => MainType, (mainType) => mainType.evidences)
  @Field(() => MainType)
  @Index()
  mainType: MainType;

  @ManyToOne(() => SecondaryType, (secondaryType) => secondaryType.evidences)
  @Field(() => SecondaryType)
  @Index()
  secondaryType: SecondaryType;

  @ManyToOne(() => Zone, (zone) => zone.evidences)
  @Field(() => Zone)
  @Index()
  zone: Zone;

  @ManyToOne(() => Processes, (process) => process.evidences)
  @Field(() => Processes, {
    nullable: true,
  })
  @Index()
  process?: Processes;

  @ManyToOne(() => User, (user) => user.evidences)
  @Field(() => User)
  @Index()
  user: User;

  @ManyToMany(() => User)
  @JoinTable()
  @Field(() => [User])
  supervisors: User[];

  @ManyToMany(() => User)
  @JoinTable()
  @Field(() => [User])
  responsibles: User[];

  @OneToMany(() => Comment, (comment) => comment.evidence)
  @Field(() => [Comment])
  comments: Comment[];
}
