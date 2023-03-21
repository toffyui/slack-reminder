import { Message } from '@slack/web-api/dist/response/ChannelsHistoryResponse';

export type ConvertMessage = Message & {
  channel: string;
};
