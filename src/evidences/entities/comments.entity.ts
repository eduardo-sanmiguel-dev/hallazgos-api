import { Field, ID, ObjectType } from '@nestjs/graphql';

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  type Relation,
  Index,
} from 'typeorm';

import { Evidence } from './evidence.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'comments' })
@ObjectType()
export class Comment {
  @PrimaryGeneratedColumn()
  @Field(() => ID)
  id: number;

  @Column()
  @Field(() => String)
  comment: string;

  @Column({ default: true })
  @Field(() => Boolean)
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', default: null })
  @Field(() => Date)
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: null })
  @Field(() => Date)
  updatedAt: Date;

  @ManyToOne(() => Evidence, (evidence) => evidence.comments)
  @Field(() => Evidence)
  @Index('IDX_comments_evidenceId')
  evidence: Relation<Evidence>;

  @ManyToOne(() => User, (user) => user.comments, {
    eager: true,
  })
  @Field(() => User)
  user: Relation<User>;
}
