import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class UserToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: string;

  @Column()
  accessToken: string;
}
