import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  ManyToOne,
} from 'typeorm';

import { TrainingGuide } from './training-guide.entity';
import { Topic } from 'topics/entities/topic.entity';

@Entity()
export class TrainingGuideEvaluation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'date',
    transformer: {
      from: (value: string) => (value ? new Date(value) : null),
      to: (value: Date) => (value ? value.toISOString().slice(0, 10) : null),
    },
    nullable: true,
  })
  evaluationDate: Date;

  @Column({ nullable: true })
  evaluationValue: string;

  @Column('text', { nullable: true })
  observations: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => TrainingGuide, (trainingGuide) => trainingGuide.evaluations)
  trainingGuideEvaluation: TrainingGuide;

  @ManyToOne(() => Topic, (topic) => topic.evaluations)
  topic: Topic;
}
