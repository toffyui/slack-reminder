import { Injectable, Logger } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { InstallProvider } from '@slack/oauth';
import { ConfigService } from '@nestjs/config';
import { ConvertMessage } from './app.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserReminder } from './user-reminder.entity';
import { IncomingMessage, ServerResponse } from 'http';
import { UserToken } from './user-token.entity';

@Injectable()
export class AppService {
  private slackClient: WebClient;
  private readonly slackInstallProvider: InstallProvider;
  private readonly logger = new Logger(AppService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(UserReminder)
    private userReminderRepository: Repository<UserReminder>,
    @InjectRepository(UserToken)
    private userTokenRepository: Repository<UserToken>,
  ) {
    const botToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.slackClient = new WebClient(botToken);
    const clientId = this.configService.get<string>('SLACK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SLACK_CLIENT_SECRET');
    this.slackInstallProvider = new InstallProvider({
      clientId,
      clientSecret,
      authVersion: 'v2',
      stateSecret: 'my-state-secret',
    });
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
      const userTokenResponse = await this.userTokenRepository.findOne({
        where: { userId: userId },
      });
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
          await this.sendReminder(
            userId,
            unrepliedMentions,
            userTokenResponse.accessToken,
          );
        } catch (error) {
          this.logger.error('Error sending reminder:', error);
        }
      }
    }
  }

  async sendReminder(
    userId: string,
    messages: ConvertMessage[],
    accessToken?: string,
  ) {
    if (accessToken) {
      this.slackClient = new WebClient(accessToken);
    }
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
    const parentMessageTs = message.thread_ts || message.ts;

    const repliesResult = await this.slackClient.conversations.replies({
      channel: channelId,
      ts: parentMessageTs,
    });

    const replies = repliesResult.messages;
    return replies.some(
      (reply) =>
        reply.user === userId &&
        parseFloat(reply.ts) > parseFloat(parentMessageTs),
    );
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

      // 各メッセージをチェック
      for (const message of messages) {
        // スレッド内のメッセージを取得
        const threadMessagesResult =
          await this.slackClient.conversations.replies({
            channel: channel.id,
            ts: message.ts,
          });

        const threadMessages = threadMessagesResult.messages;
        // チャンネルに参加しましたというメッセージの場合は無視する
        if (message.subtype === 'channel_join') continue;
        // メインチャンネルとスレッド内のメッセージを結合
        const allMessages = [message, ...threadMessages];

        // リアクションがないメッセージをフィルタリング
        for (const msg of allMessages) {
          if (userMentionRegex.test(msg.text)) {
            // ユーザーがリアクションしていないかチェック
            const userHasNotReacted =
              !msg.reactions ||
              msg.reactions.every(
                (reaction) => !reaction.users.includes(userId),
              );

            // ユーザーが返信していないかチェック
            const userHasNotReplied = !(await this.userHasRepliedToMessage(
              userId,
              msg,
              channel.id,
            ));

            if (userHasNotReacted && userHasNotReplied) {
              unrepliedMentions.push({ channel: channel.id, ...msg });
            }
          }
        }
      }
    }
    // 未返信のメッセージリストを返す
    return unrepliedMentions;
  }

  // データベースからユーザーのリマインダーを削除する
  async deleteUserReminder(userId: string) {
    await this.userReminderRepository.delete({ userId });
  }

  // 認証関連
  async generateAuthUrl() {
    const authUrl = await this.slackInstallProvider.generateInstallUrl({
      scopes: ['commands', 'channels:history', 'channels:join', 'chat:write'],
    });
    return { url: authUrl };
  }
  async authenticateBot(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      // handleCallback を使用して認証処理を行う
      await this.slackInstallProvider.handleCallback(req, res);

      // 認証結果を取得するために、InstallationStore から botToken を取得
      const baseUrl = this.configService.get<string>('BASE_URL');
      const teamId = new URL(req.url, baseUrl).searchParams.get('team_id');
      const installation =
        await this.slackInstallProvider.installationStore.fetchInstallation({
          teamId,
          isEnterpriseInstall: false,
          enterpriseId: null,
        });
      const botToken = installation.bot.token;
      await this.saveUserToken(teamId, botToken);
      this.slackClient = new WebClient(botToken);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('認証に成功しました。');
    } catch (error) {
      console.error('Error during authentication:', error);
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('認証中にエラーが発生しました。');
    }
  }
  async saveUserToken(userId: string, accessToken: string) {
    const existingToken = await this.userTokenRepository.findOne({
      where: { userId },
    });

    if (existingToken) {
      // Update the access token if it already exists
      existingToken.accessToken = accessToken;
      await this.userTokenRepository.save(existingToken);
    } else {
      // Create a new entry if it doesn't exist
      const newUserToken = this.userTokenRepository.create({
        userId,
        accessToken,
      });
      await this.userTokenRepository.save(newUserToken);
    }
  }
}
