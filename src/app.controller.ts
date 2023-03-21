import { Controller, Post, Req, Res } from '@nestjs/common';
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

  @Post('/events')
  async handleEvents(@Req() req: Request, @Res() res: Response) {
    this.slackEvents
      .createEventHandler()
      .then((handler) => handler(req, res))
      .catch((error) => {
        console.error(`Failed to handle event: ${error}`);
        res.status(500).send();
      });
  }
}
