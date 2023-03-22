import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class UserReminder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  time: string;
}
