import { Injectable } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly slackClient: WebClient;

  constructor(private configService: ConfigService) {
    const botToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.slackClient = new WebClient(botToken);
  }

  async sendReminder(userId: string, messages: any[]) {
    const text = `リマインダー: 未返信のメッセージが${messages.length}件あります`;

    // 各メッセージについて、リマインダーに情報を追加
    const blocks = messages.map((message) => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${message.permalink}|${message.text}>*`,
      },
    }));

    // リマインダーを送信
    await this.slackClient.chat.postMessage({
      channel: userId,
      text: text,
      blocks: blocks,
    });
  }
  async fetchUnrepliedMentions(userId: string) {
    const userMentionRegex = new RegExp(`<@${userId}>`);

    // チャンネルリストを取得
    const channelsResult: any = await this.slackClient.conversations.list();
    const channels = channelsResult.channels;

    const unrepliedMentions = [];

    // 各チャンネルでユーザー宛てのメンションを検索
    for (const channel of channels) {
      const messagesResult: any = await this.slackClient.conversations.history({
        channel: channel.id,
      });
      const messages = messagesResult.messages;

      // リアクションがないメッセージをフィルタリング
      for (const message of messages) {
        if (
          userMentionRegex.test(message.text) &&
          (!message.reactions || message.reactions.length === 0)
        ) {
          unrepliedMentions.push(message);
        }
      }
    }

    // 未返信のメッセージリストを返す
    return unrepliedMentions;
  }
}
