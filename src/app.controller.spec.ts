import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('handleEvents', () => {
    it('should return status 200 for a valid event', async () => {
      const event = {
        token: 'some_token',
        team_id: 'some_team_id',
        api_app_id: 'some_api_app_id',
        event: {
          type: 'app_mention',
          user: 'some_user_id',
          text: '<@some_user_id> some text',
          ts: 'timestamp',
          channel: 'some_channel_id',
          event_ts: 'event_timestamp',
        },
        type: 'event_callback',
        event_id: 'some_event_id',
        event_time: 1234567890,
        authed_users: ['some_user_id'],
      };

      const responseMock = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      jest
        .spyOn(appService, 'sendReminder')
        .mockImplementation(() => Promise.resolve());
      await appController.handleEvents(
        { body: event } as any,
        responseMock as any,
      );

      expect(responseMock.status).toHaveBeenCalledWith(200);
      expect(responseMock.send).toHaveBeenCalled();
    });
  });
});
