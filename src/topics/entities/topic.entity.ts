import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { ConfigsTopicTg } from 'configs-tg/entities';
import { User } from 'users/entities/user.entity';
import { TrainingGuideEvaluation } from 'training-guides/entities';

export enum TypesOfEvaluations {
  BOOLEAN = 'BOOLEAN',
  NUMERIC = 'NUMERIC',
}

@Entity()
export class Topic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text', {
    unique: true,
  })
  name: string;

  @Column()
  duration: number;

  @Column({
    type: 'enum',
    enum: TypesOfEvaluations,
  })
  typeOfEvaluation: TypesOfEvaluations;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.topicsCreated)
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.topicsUpdated)
  updatedBy: User;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.topics,
    { cascade: true },
  )
  manufacturingPlants: ManufacturingPlant[];

  @OneToMany(() => ConfigsTopicTg, (configsTopicTg) => configsTopicTg.topic)
  configs: ConfigsTopicTg[];

  @OneToMany(
    () => TrainingGuideEvaluation,
    (trainingGuideEvaluation) => trainingGuideEvaluation.topic,
  )
  evaluations: TrainingGuideEvaluation[];
}
