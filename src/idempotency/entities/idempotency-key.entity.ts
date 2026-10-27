import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity.js';

export type IdempotencyStatus = 'processing' | 'done' | 'failed';

/**
 * Envíos ya procesados por clave de idempotencia (header Idempotency-Key).
 * Un reintento con la misma clave devuelve la respuesta guardada en lugar de
 * volver a crear el registro y mandar correos. Se conservan 7 días.
 */
@Entity({ name: 'idempotency_key' })
@Index('IDX_idempotency_key_created_at', ['createdAt'])
export class IdempotencyKey {
  // Por usuario: con la clave de otro no se lee una respuesta ajena.
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @PrimaryColumn({ type: 'uuid' })
  key: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** "POST /api/v1/evidences/solution/12": la clave no sirve en otra ruta. */
  @Column({ type: 'varchar', length: 160 })
  route: string;

  @Column({ type: 'varchar', length: 12, default: 'processing' })
  status: IdempotencyStatus;

  @Column({ name: 'http_status', type: 'smallint', nullable: true })
  httpStatus: number | null;

  /** Cuerpo exacto de la respuesta exitosa. */
  @Column({ type: 'jsonb', nullable: true })
  response: unknown;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
