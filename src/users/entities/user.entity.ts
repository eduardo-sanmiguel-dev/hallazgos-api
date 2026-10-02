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
  Relation,
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
import { ConfigsTopicTg } from 'configs-tg/entities';

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

  @CreateDateColumn()
  @Field(() => Date)
  createdAt: Date;

  @UpdateDateColumn()
  @Field(() => Date)
  updatedAt: Date;

  @ManyToMany(() => ManufacturingPlant)
  @JoinTable({
    name: 'user_manufacturing_plants',
  })
  @Field(() => [ManufacturingPlant])
  manufacturingPlants: Relation<ManufacturingPlant[]>;

  @ManyToMany(() => Zone)
  @JoinTable({
    name: 'user_zones',
  })
  @Field(() => [Zone])
  zones: Relation<Zone[]>;

  @ManyToMany(() => Processes)
  @JoinTable({
    name: 'user_processes',
  })
  @Field(() => [Processes])
  processes: Relation<Processes[]>;

  @OneToMany(() => Evidence, (evidence) => evidence.user)
  @Field(() => [Evidence])
  evidences: Relation<Evidence[]>;

  @OneToMany(() => Comment, (evidence) => evidence.user)
  @Field(() => [Comment])
  comments: Relation<Comment[]>;

  @OneToMany(() => Ics, (ics) => ics.createdBy)
  ics: Relation<Ics[]>;

  @OneToMany(() => Epp, (epp) => epp.createBy)
  epps: Relation<Epp[]>;

  @OneToMany(() => Topic, (topic) => topic.createdBy)
  topicsCreated: Relation<Topic[]>;

  @OneToMany(() => Topic, (topic) => topic.updatedBy)
  topicsUpdated: Relation<Topic[]>;

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.createdBy)
  configTgCreated: Relation<ConfigsTg[]>;

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.updatedBy)
  configTgUpdated: Relation<ConfigsTg[]>;

  @OneToMany(() => Equipment, (equipment) => equipment.createdBy)
  equipmentCreated: Relation<Equipment[]>;

  @OneToMany(() => Equipment, (equipment) => equipment.updatedBy)
  equipmentUpdated: Relation<Equipment[]>;

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.areaManager)
  areaTg: Relation<ConfigsTg[]>;

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.humanResourceManager)
  humanResourceTg: Relation<ConfigsTg[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.createdBy)
  ciaels: Relation<Ciael[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.areaLeader)
  ciaelsAreaLeader: Relation<Ciael[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.areaLeader)
  ciaelsAreaManager: Relation<Ciael[]>;

  @OneToMany(() => TrainingGuide, (trainingGuide) => trainingGuide.areaManager)
  trainingGuidesAreaManager: Relation<TrainingGuide[]>;

  @OneToMany(
    () => TrainingGuide,
    (trainingGuide) => trainingGuide.humanResourceManager,
  )
  trainingGuidesHumanResourceManager: Relation<TrainingGuide[]>;

  @ManyToMany(
    () => ConfigsTopicTg,
    (configsTopicTg) => configsTopicTg.responsibles,
  )
  configsTopicTg: Relation<ConfigsTopicTg[]>;

  @BeforeInsert()
  async hashPassword() {
    this.password = await argon2.hash(this.password);
  }
}
