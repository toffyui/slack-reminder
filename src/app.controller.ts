import { Controller, Post, Req, Res, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from './app.service';
import { createEventAdapter } from '@slack/events-api';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  private _slackEvents;
  get slackEvents() {
    return this._slackEvents;
  }
  set slackEvents(value) {
    this._slackEvents = value;
  }
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
  ) {
    const slackSigningSecret = this.configService.get<string>(
      'SLACK_SIGNING_SECRET',
    );
    this._slackEvents = createEventAdapter(slackSigningSecret);

    // メンションイベントのリスナーを登録
    this._slackEvents.on('app_mention', async (event) => {
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
    console.log('Received event:', body);
    if (body.type === 'url_verification') {
      console.log('Sending challenge:', body.challenge);
      res.send(body.challenge);
    } else {
      try {
        await this.slackEvents.handle(req, res);
      } catch (error) {
        console.error(`Failed to handle event: ${error}`);
        res.status(500).send();
      }
    }
  }

  @Post()
  async handleCommands(@Req() request: Request, @Res() response: Response) {
    const payload = request.body;
    const command = payload.command;
    console.log('Received command:', command);
    /*
     * 時間は、次のような形式で指定できる
     * "hourly"（1時間ごと）
     * "daily"（毎日）
     * "weekly"（毎週）
     */
    switch (command) {
      case '/mention-reminder':
        try {
          const time = payload.text.trim().toLowerCase();
          // ユーザーIDとリマインド時間を保存
          this.appService.addUserReminder(payload.user_id, time);
          response.status(200).send(`リマインダーが${time}で設定されました。`);
        } catch (error) {
          console.error('Error saving user reminder:', error);
          response
            .status(500)
            .send('リマインダーの設定中にエラーが発生しました。');
        }
        break;
      case '/unread':
        try {
          // 未返信のメッセージを取得
          const unrepliedMentions =
            await this.appService.fetchUnrepliedMentions(payload.user_id);
          await this.appService.sendReminder(
            payload.user_id,
            unrepliedMentions,
          );
          response.status(200).send('リマインダーを送信しました。');
        } catch (error) {
          console.error('Error sending reminder:', error);
          response
            .status(500)
            .send('リマインダーの送信中にエラーが発生しました。');
        }
        break;
      default:
        response.status(400).send('無効なコマンドです。');
    }
  }
}
