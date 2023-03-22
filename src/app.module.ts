import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserReminder } from './user-reminder.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [UserReminder],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([UserReminder]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(bodyParser.urlencoded({ extended: true })).forRoutes('*');
  }
}
