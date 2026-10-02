import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Relation,
} from 'typeorm';

import { Topic } from 'topics/entities/topic.entity';
import { User } from 'users/entities/user.entity';
import { ConfigsTg } from './configs-tg.entity';

@Entity()
export class ConfigsTopicTg {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  order: number;

  @ManyToOne(() => Topic, (topic) => topic.configs)
  topic: Relation<Topic>;

  @ManyToMany(() => User, (employee) => employee.configsTopicTg)
  @JoinTable({
    name: 'configs_topic_tg_responsibles',
  })
  responsibles: Relation<User[]>;

  @ManyToOne(() => ConfigsTg, (configsTg) => configsTg.topics)
  configTg: Relation<ConfigsTg>;
}
