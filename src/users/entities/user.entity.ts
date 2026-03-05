import { Field, ID, ObjectType } from '@nestjs/graphql';

import * as argon2 from 'argon2';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { ConfigsTg } from 'configs-tg/entities/configs-tg.entity';
import { Processes } from 'processes/entities/processes.entity';
import { Evidence } from 'evidences/entities/evidence.entity';
import { Comment } from 'evidences/entities/comments.entity';
import { TrainingGuide } from 'training-guides/entities';
import { Topic } from 'topics/entities/topic.entity';
import { Ciael } from 'ciaels/entities/ciael.entity';
import { Zone } from 'zones/entities/zone.entity';
import { Equipment } from 'equipments/entities';
import { Epp } from 'epps/entities/epp.entity';
import { Ics } from 'ics/entities/ics.entity';

@Entity()
@ObjectType()
export class User {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column()
  @Field(() => String)
  name: string;

  @Column({ unique: true })
  @Field(() => String)
  email: string;

  @Column({ select: false })
  @Field(() => String)
  password: string;

  @Column()
  @Field(() => String)
  role: string;

  @Column({ default: true })
  @Field(() => Boolean)
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  @Field(() => Date)
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  @Field(() => Date)
  updatedAt: Date;

  @ManyToMany(() => ManufacturingPlant)
  @JoinTable({
    name: 'user_manufacturing_plants',
  })
  @Field(() => [ManufacturingPlant])
  manufacturingPlants: ManufacturingPlant[];

  @ManyToMany(() => Zone)
  @JoinTable({
    name: 'user_zones',
  })
  @Field(() => [Zone])
  zones: Zone[];

  @ManyToMany(() => Processes)
  @JoinTable({
    name: 'user_processes',
  })
  @Field(() => [Processes])
  processes: Processes[];

  @OneToMany(() => Evidence, (evidence) => evidence.user)
  @Field(() => [Evidence])
  evidences: Evidence[];

  @OneToMany(() => Comment, (evidence) => evidence.user)
  @Field(() => [Comment])
  comments: Comment[];

  @OneToMany(() => Ics, (ics) => ics.createdBy)
  ics: Ics[];

  @OneToMany(() => Epp, (epp) => epp.createBy)
  epps: Epp[];

  @OneToMany(() => Topic, (topic) => topic.createdBy)
  topicsCreated: Topic[];

  @OneToMany(() => Topic, (topic) => topic.updatedBy)
  topicsUpdated: Topic[];

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.createdBy)
  configTgCreated: ConfigsTg[];

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.updatedBy)
  configTgUpdated: ConfigsTg[];

  @OneToMany(() => Equipment, (equipment) => equipment.createdBy)
  equipmentCreated: Equipment[];

  @OneToMany(() => Equipment, (equipment) => equipment.updatedBy)
  equipmentUpdated: Equipment[];

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.areaManager)
  areaTg: ConfigsTg[];

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.humanResourceManager)
  humanResourceTg: ConfigsTg[];

  @OneToMany(() => Ciael, (ciael) => ciael.createdBy)
  ciaels: Ciael[];

  @OneToMany(() => Ciael, (ciael) => ciael.areaLeader)
  ciaelsAreaLeader: Ciael[];

  @OneToMany(() => Ciael, (ciael) => ciael.areaLeader)
  ciaelsAreaManager: Ciael[];

  @OneToMany(() => TrainingGuide, (trainingGuide) => trainingGuide.areaManager)
  trainingGuidesAreaManager: TrainingGuide[];

  @OneToMany(
    () => TrainingGuide,
    (trainingGuide) => trainingGuide.humanResourceManager,
  )
  trainingGuidesHumanResourceManager: TrainingGuide[];

  @BeforeInsert()
  async hashPassword() {
    this.password = await argon2.hash(this.password);
  }
}
