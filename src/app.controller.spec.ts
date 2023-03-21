import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Request, Response } from 'express';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('handleEvents', () => {
    it('should return the challenge value for url_verification events', async () => {
      const mockRes: Partial<Response> = {
        send: jest.fn(),
      };

      const body = {
        type: 'url_verification',
        challenge: 'test_challenge_value',
      };

      await appController.handleEvents(
        body,
        {} as Request,
        mockRes as Response,
      );

      expect(mockRes.send).toHaveBeenCalledWith(body.challenge);
    });

    it('should handle other event types using the slackEvents object', async () => {
      const mockRes: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const mockReq: Partial<Request> = {};

      const body = {
        type: 'some_event_type',
      };

      const handle = jest.fn().mockResolvedValue(undefined);
      const slackEvents = { handle };
      appController.slackEvents = slackEvents;

      await appController.handleEvents(
        body,
        mockReq as Request,
        mockRes as Response,
      );

      expect(handle).toHaveBeenCalledWith(mockReq, mockRes);
    });
  });
  describe('handleCommands', () => {
    it('should handle the /unread command and send a reminder', async () => {
      const payload = {
        command: '/unread',
        user_id: 'test_user_id',
      };

      const mockReq: Partial<Request> = { body: payload };
      const mockRes: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const unrepliedMentions = ['message1', 'message2'];
      jest
        .spyOn(appService, 'fetchUnrepliedMentions')
        .mockResolvedValue(unrepliedMentions);
      jest.spyOn(appService, 'sendReminder').mockResolvedValue(undefined);

      await appController.handleCommands(
        mockReq as Request,
        mockRes as Response,
      );

      expect(appService.fetchUnrepliedMentions).toHaveBeenCalledWith(
        payload.user_id,
      );
      expect(appService.sendReminder).toHaveBeenCalledWith(
        payload.user_id,
        unrepliedMentions,
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('リマインダーを送信しました。');
    });

    it('should respond with an error status for invalid commands', async () => {
      const payload = {
        command: '/invalid',
        user_id: 'test_user_id',
      };

      const mockReq: Partial<Request> = { body: payload };
      const mockRes: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await appController.handleCommands(
        mockReq as Request,
        mockRes as Response,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('無効なコマンドです。');
    });
  });
});
