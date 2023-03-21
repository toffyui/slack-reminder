import { Controller, Post, Req, Res, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from './app.service';
import { createEventAdapter } from '@slack/events-api';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  private readonly slackEvents;
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
  ) {
    const slackSigningSecret = this.configService.get<string>(
      'SLACK_SIGNING_SECRET',
    );
    this.slackEvents = createEventAdapter(slackSigningSecret);

    // メンションイベントのリスナーを登録
    this.slackEvents.on('app_mention', async (event) => {
      const userId = event.user;

      // 未返信のメッセージを取得
      const unrepliedMentions = await this.appService.fetchUnrepliedMentions(
        userId,
      );

      // リマインダーを送信
      await this.appService.sendReminder(userId, unrepliedMentions);
    });
  }

  @Post('events')
  async handleEvents(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (body.type === 'url_verification') {
      res.send(body.challenge);
    } else {
      res.sendStatus(200);
    }
    this.slackEvents
      .createEventHandler()
      .then((handler) => handler(req, res))
      .catch((error) => {
        console.error(`Failed to handle event: ${error}`);
        res.status(500).send();
      });
  }

  @Post('commands')
  async handleCommands(@Req() request: Request, @Res() response: Response) {
    const payload = request.body;
    const command = payload.command;

    if (command === '/unread') {
      try {
        // 未返信のメッセージを取得
        const unrepliedMentions = await this.appService.fetchUnrepliedMentions(
          payload.user_id,
        );
        await this.appService.sendReminder(payload.user_id, unrepliedMentions);
        response.status(200).send('リマインダーを送信しました。');
      } catch (error) {
        console.error('Error sending reminder:', error);
        response
          .status(500)
          .send('リマインダーの送信中にエラーが発生しました。');
      }
    } else {
      response.status(400).send('無効なコマンドです。');
    }
  }
}
