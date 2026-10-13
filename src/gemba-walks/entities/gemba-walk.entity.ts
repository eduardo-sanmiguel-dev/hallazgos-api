import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  Relation,
} from 'typeorm';

import { GembaWalkCalendar } from 'gemba-walk-calendar/entities/gemba-walk-calendar.entity';
import { User } from 'users/entities/user.entity';
import { GembaWalkResult } from './gemba-walk-result.entity';

// Recorrido registrado por un observador sobre un evento programado.
// No se edita ni se elimina.
@Index(['gembaWalkCalendar'], { unique: true })
@Entity({ name: 'gemba_walks' })
export class GembaWalk {
  @PrimaryGeneratedColumn()
  id: number;

  // Inicio y fin del recorrido; ambos los fija el servidor.
  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamptz' })
  performedAt: Date;

  // Tiempo que se tardó (performedAt - startedAt), en segundos.
  @Column({ type: 'integer', nullable: true })
  durationSeconds?: number | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  createdBy: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  updatedBy?: Relation<User>;

  @ManyToOne(() => GembaWalkCalendar)
  gembaWalkCalendar: Relation<GembaWalkCalendar>;

  @OneToMany(() => GembaWalkResult, (result) => result.gembaWalk, {
    cascade: ['insert'],
  })
  results: Relation<GembaWalkResult[]>;
}
