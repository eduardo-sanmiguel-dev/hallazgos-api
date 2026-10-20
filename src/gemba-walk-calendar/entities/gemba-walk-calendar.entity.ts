import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Relation,
  Index,
} from 'typeorm';

import { GembaWalkZone } from 'gemba-walk-zones/entities/gemba-walk-zone.entity';
import { User } from 'users/entities/user.entity';

@Entity({ name: 'gemba_walk_calendar' })
export class GembaWalkCalendar {
  @PrimaryGeneratedColumn()
  id: number;

  // Instante real (timestamptz): no depende de la zona del servidor.
  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  // Evento fuera de la programación regular.
  @Column({ default: false })
  isAdditional: boolean;

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

  @ManyToOne(() => GembaWalkZone)
  @Index('IDX_gemba_walk_calendar_gembaWalkZoneId')
  gembaWalkZone: Relation<GembaWalkZone>;
}
