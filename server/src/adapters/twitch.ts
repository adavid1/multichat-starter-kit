import tmi from 'tmi.js';
import type { AdapterConfig, StopFunction, TwitchConfig } from '../../../shared/types.js';

interface TwitchAdapterConfig extends AdapterConfig, TwitchConfig {}

export async function startTwitch({ 
  channel,
  onMessage, 
  debug = false 
}: TwitchAdapterConfig): Promise<StopFunction> {
  // tmi.js expects channel names without a leading '#'
  const normalizedChannel = channel.startsWith('#') ? channel.slice(1) : channel;
  const client = new tmi.Client({
    options: { debug },
    channels: [normalizedChannel]
  });

  client.on('message', (channel: string, tags: any, message: string, self: boolean) => {
    if (self) return;
    
    try {
      // Extract subscription months from badges
      let subscriptionMonths: number | null = null;
      if (tags.badges && tags.badges.subscriber) {
        subscriptionMonths = parseInt(tags.badges.subscriber, 10);
      }

      onMessage({
        username: tags['display-name'] || tags.username || 'unknown',
        message,
        badges: Object.keys(tags.badges || {}),
        color: tags.color || null,
        raw: { 
          channel, 
          tags,
          subscriptionMonths // Include subscription months in raw data
        }
      });
    } catch (error) {
      if (debug) console.error('[twitch] message processing error:', (error as Error).message);
    }
  });

  client.on('connected', (addr: string, port: number) => {
    if (debug) console.log(`[twitch] connected to ${addr}:${port}`);
  });

  client.on('disconnected', (reason: string) => {
    if (debug) console.log(`[twitch] disconnected: ${reason}`);
  });

  await client.connect();
  if (debug) console.log('[twitch] connected to channel:', `#${normalizedChannel}`);

  return async function stop(): Promise<void> {
    try {
      await client.disconnect();
      if (debug) console.log('[twitch] disconnected');
    } catch (error) {
      if (debug) console.error('[twitch] disconnect error:', (error as Error).message);
    }
  };
}