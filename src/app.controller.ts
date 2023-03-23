import { Controller, Get, Req, Res, Post } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from './app.service';
import { OauthV2AccessResponse } from '@slack/web-api';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('commands')
  async handleCommands(@Req() request: Request, @Res() response: Response) {
    const payload = request.body;
    const command = payload.command;
    /*
     * 時間は、次のような形式で指定できる
     * "hourly"（1時間ごと）
     * "daily"（毎日）
     * "weekly"（毎週）
     */
    switch (command) {
      case '/slack-minder':
        const text = payload.text.trim().toLowerCase();
        if (text === 'help') {
          response
            .status(200)
            .send(
              `以下の形式でコマンドを送信することができます。：\n` +
                `/slack-minder hourly - 1時間に1回未読メッセージを取得してリマインドを送ります\n` +
                `/slack-minder daily - 1日に1回未読メッセージを取得してリマインドを送ります\n` +
                `/slack-minder weekly - 1週間に1回未読メッセージを取得してリマインドを送ります\n` +
                `/slack-minder unread - 現時点での未読メッセージを取得して送信します\n` +
                `/slack-minder delete - 設定しているリマインダーを削除します\n` +
                `※未読メッセージの取得には時間がかかりますのでしばらくお待ち下さい。`,
            );
          return;
        }
        if (text === 'delete') {
          this.handleDeleteReminder(payload);
          response.status(200).send('リマインダーが削除されました。');
          return;
        }
        if (text === 'unread') {
          this.handleUnread(payload);
          response.status(200).send('未読メッセージを取得しています...');
          return;
        }
        // 時間の形式が正しいか確認
        if (['hourly', 'daily', 'weekly'].includes(text)) {
          this.handleMentionReminder(payload);
          response.status(200).send(`リマインダーが${text}で設定されました。`);
          return;
        }
        response
          .status(200)
          .send(
            `無効なコマンドです。以下の形式でコマンドを送信してください：\n` +
              `/slack-minder hourly - 毎時リマインダーの設定\n` +
              `/slack-minder daily - 毎日リマインダーの設定\n` +
              `/slack-minder weekly - 毎週リマインダーの設定\n` +
              `/slack-minder unread - 未読メッセージの取得\n` +
              `/slack-minder delete - リマインダーの削除\n` +
              `/slack-minder help - 使い方がわからない場合はこちら`,
          );
        break;
      default:
        return response.status(400).send('無効なコマンドです。');
    }
  }
  async handleMentionReminder(payload) {
    try {
      const time = payload.text.trim().toLowerCase();
      // ユーザーIDとリマインド時間を保存
      await this.appService.addUserReminder(payload.user_id, time);
    } catch (error) {
      console.error('Error saving user reminder:', error);
    }
  }

  async handleUnread(payload) {
    try {
      // 未返信のメッセージを取得
      const unrepliedMentions = await this.appService.fetchUnrepliedMentions(
        payload.user_id,
      );
      await this.appService.sendReminder(payload.user_id, unrepliedMentions);
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }

  async handleDeleteReminder(payload) {
    try {
      // ユーザーのリマインダーを削除
      await this.appService.deleteUserReminder(payload.user_id);
    } catch (error) {
      console.error('Error deleting user reminder:', error);
    }
  }

  // 認証関連
  @Get('auth/callback')
  async getToken(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<OauthV2AccessResponse | void> {
    const code = request.query.code as string | undefined;
    const error = request.query.error as string | undefined;
    await this.appService.getToken(code, error);
    response.redirect('https://www.google.com/');
  }
}
