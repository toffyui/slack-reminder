import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserReminder } from './user-reminder.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { UserToken } from './user-token.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [UserReminder, UserToken],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([UserReminder, UserToken]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(bodyParser.urlencoded({ extended: true })).forRoutes('*');
  }
}
