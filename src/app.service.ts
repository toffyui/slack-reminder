import { Injectable, Logger } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { ConfigService } from '@nestjs/config';
import { ConvertMessage } from './app.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserReminder } from './user-reminder.entity';

@Injectable()
export class AppService {
  private readonly slackClient: WebClient;
  private readonly logger = new Logger(AppService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(UserReminder)
    private userReminderRepository: Repository<UserReminder>,
  ) {
    const botToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.slackClient = new WebClient(botToken);
  }

  async addUserReminder(userId: string, time: string) {
    const existingReminder = await this.userReminderRepository.findOne({
      where: { userId },
    });
    if (existingReminder) {
      // リマインダーが存在する場合、更新
      existingReminder.time = time;
      await this.userReminderRepository.save(existingReminder);
    } else {
      // リマインダーが存在しない場合、新規作成
      const newUserReminder = this.userReminderRepository.create({
        userId,
        time,
      });
      await this.userReminderRepository.save(newUserReminder);
    }
  }

  removeUserReminder(userId: string) {
    this.userReminderRepository.delete({ userId });
  }

  @Cron(CronExpression.EVERY_HOUR)
  handleCron() {
    this.sendReminders();
  }

  async getPermalink(channel: string, ts: string) {
    const res = await this.slackClient.chat.getPermalink({
      channel,
      message_ts: ts,
    });
    return res.permalink;
  }

  async sendReminders() {
    const now = new Date();
    this.logger.log('Checking reminders for all users');
    const userReminders = await this.userReminderRepository.find();
    for (const { userId, time } of userReminders) {
      this.logger.log(userId, time);
      let shouldSend = false;
      switch (time) {
        case 'hourly':
          shouldSend = now.getMinutes() === 0;
          break;
        case 'daily':
          shouldSend = now.getHours() === 0 && now.getMinutes() === 0;
          break;
        case 'weekly':
          shouldSend =
            now.getDay() === 0 &&
            now.getHours() === 0 &&
            now.getMinutes() === 0;
          break;
      }

      if (shouldSend) {
        try {
          const unrepliedMentions = await this.fetchUnrepliedMentions(userId);
          await this.sendReminder(userId, unrepliedMentions);
        } catch (error) {
          this.logger.error('Error sending reminder:', error);
        }
      }
    }
  }

  async sendReminder(userId: string, messages: ConvertMessage[]) {
    const baseText =
      messages.length === 0
        ? 'リマインダー：未返信のメッセージはありません:tada:'
        : `リマインダー: 未返信のメッセージが${messages.length}件あります`;

    // 各メッセージについて、リマインダーに情報を追加
    const blocksPromises = messages.map(async (message) => {
      const permalink = await this.getPermalink(message.channel, message.ts);
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: permalink,
        },
      };
    });

    // すべてのパーマリンクを取得
    const blocks = await Promise.all(blocksPromises);

    // リマインダーを送信
    await this.slackClient.chat.postMessage({
      channel: userId,
      text: baseText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${baseText}`,
          },
        },
        ...blocks,
      ],
    });
  }

  // ユーザーがメッセージに返信しているかをチェックする関数
  async userHasRepliedToMessage(
    userId: string,
    message: any,
    channelId: string,
  ) {
    const repliesResult = await this.slackClient.conversations.replies({
      channel: channelId,
      ts: message.ts,
    });

    const replies = repliesResult.messages;
    return replies.some((reply) => reply.user === userId);
  }

  async fetchUnrepliedMentions(userId: string) {
    const userMentionRegex = new RegExp(`<@${userId}>`);

    // チャンネルリストを取得
    const channelsResult = await this.slackClient.conversations.list();
    const channels = channelsResult.channels;

    const unrepliedMentions = [];

    // 各チャンネルでユーザー宛てのメンションを検索
    for (const channel of channels) {
      // Botがチャンネルに参加していない場合、参加させる
      if (!channel.is_member) {
        try {
          await this.slackClient.conversations.join({ channel: channel.id });
        } catch (error) {
          console.error(`Failed to join channel ${channel.name}:`, error);
          continue;
        }
      }
      const messagesResult = await this.slackClient.conversations.history({
        channel: channel.id,
      });
      const messages = messagesResult.messages;
      // リアクションがないメッセージをフィルタリング
      for (const message of messages) {
        if (
          message.subtype !== 'channel_join' &&
          userMentionRegex.test(message.text)
        ) {
          // ユーザーがリアクションしていないかチェック
          const userHasNotReacted =
            !message.reactions ||
            message.reactions.every(
              (reaction) => !reaction.users.includes(userId),
            );

          // ユーザーが返信していないかチェック
          const userHasNotReplied = !(await this.userHasRepliedToMessage(
            userId,
            message,
            channel.id,
          ));

          if (userHasNotReacted && userHasNotReplied) {
            unrepliedMentions.push({ channel: channel.id, ...message });
          }
        }
      }
    }
    // 未返信のメッセージリストを返す
    return unrepliedMentions;
  }
}
