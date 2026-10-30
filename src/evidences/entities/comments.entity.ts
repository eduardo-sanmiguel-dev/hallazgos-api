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
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comment: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', default: null })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: null })
  updatedAt: Date;

  @ManyToOne(() => Evidence, (evidence) => evidence.comments)
  @Index('IDX_comments_evidenceId')
  evidence: Relation<Evidence>;

  @ManyToOne(() => User, (user) => user.comments, {
    eager: true,
  })
  user: Relation<User>;
}
