import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { startTwitch } from './adapters/twitch.js';
import { startTikTok } from './adapters/tiktok.js';
import { startYouTube } from './adapters/youtube';
import type { ChatMessage, Platform, AdapterEvent, StopFunction, WebSocketMessage } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8787', 10);
const DEBUG = (process.env.DEBUG || 'false').toLowerCase() === 'true';
const isDevelopment = process.env.NODE_ENV !== 'production';

// Express server
const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (_req, res) => res.json({ ok: true }));

// In development, don't serve static files (Vite handles this)
// In production, serve the built React app
if (!isDevelopment) {
  const clientDistPath = path.join(__dirname, '../../client/dist');
  
  if (existsSync(clientDistPath)) {
    console.log(`[server] Serving static files from ${clientDistPath}`);
    app.use(express.static(clientDistPath));
    
    // Serve React app for all other routes (SPA routing)
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    console.warn(`[server] Client dist folder not found at ${clientDistPath}`);
    console.warn('[server] Run "npm run build" to build the client first');
    
    // Provide helpful error page
    app.get('*', (_req, res) => {
      res.status(404).send(`
        <html>
          <head><title>Multichat - Build Required</title></head>
          <body style="font-family: system-ui; padding: 2rem; background: #111; color: #fff;">
            <h1>🚧 Build Required</h1>
            <p>The client application hasn't been built yet.</p>
            <p>Please run:</p>
            <pre style="background: #222; padding: 1rem; border-radius: 8px;">npm run build</pre>
            <p>Then restart the server.</p>
            <hr style="margin: 2rem 0; border-color: #333;">
            <p><strong>For development:</strong> Use <code>npm run dev</code> and access <a href="http://localhost:5173" style="color: #60a5fa;">http://localhost:5173</a></p>
            <p><strong>WebSocket server:</strong> Running on ws://localhost:${PORT}</p>
          </body>
        </html>
      `);
    });
  }
} else {
  console.log('[server] Development mode - static files served by Vite');
  
  // In development, provide a simple info page
  app.get('*', (_req, res) => {
    res.send(`
      <html>
        <head><title>Multichat Server - Development</title></head>
        <body style="font-family: system-ui; padding: 2rem; background: #111; color: #fff;">
          <h1>🚀 Multichat Server</h1>
          <p>Server is running in development mode.</p>
          <p><strong>React Dev Server:</strong> <a href="http://localhost:5173" style="color: #60a5fa;">http://localhost:5173</a></p>
          <p><strong>WebSocket Server:</strong> ws://localhost:${PORT}</p>
          <hr style="margin: 2rem 0; border-color: #333;">
          <h2>For OBS:</h2>
          <p>Use: <a href="http://localhost:5173/?mode=public" style="color: #60a5fa;">http://localhost:5173/?mode=public</a></p>
        </body>
      </html>
    `);
  });
}

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

function broadcast(msg: ChatMessage | WebSocketMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      try {
        client.send(data);
      } catch (e) {
        if (DEBUG) console.error('WS send error:', (e as Error).message);
      }
    }
  }
}

// Normalize incoming events to a common shape
function normalize({ 
  platform, 
  username, 
  message, 
  badges = [], 
  color, 
  raw = {} 
}: { platform: Platform } & AdapterEvent): ChatMessage {
  return {
    id: uuidv4(),
    ts: Date.now(),
    platform,
    username,
    message,
    badges,
    color: color || null,
    raw
  };
}

wss.on('connection', (ws) => {
  if (DEBUG) console.log('[ws] client connected');
  
  // Send connection acknowledgment
  ws.send(JSON.stringify({ 
    type: 'connection', 
    message: 'Connected to multichat server' 
  } as WebSocketMessage));
  
  ws.on('close', () => {
    if (DEBUG) console.log('[ws] client disconnected');
  });
});

// Start adapters
const stopFns: StopFunction[] = [];

async function initializeAdapters(): Promise<void> {
  // Twitch
  if (process.env.TWITCH_USERNAME && process.env.TWITCH_OAUTH && process.env.TWITCH_CHANNELS) {
    try {
      const stopTwitch = await startTwitch({
        username: process.env.TWITCH_USERNAME,
        oauth: process.env.TWITCH_OAUTH,
        channels: process.env.TWITCH_CHANNELS.split(',').map(s => s.trim()).filter(Boolean),
        onMessage(evt) {
          const normalized = normalize({ platform: 'twitch', ...evt });
          broadcast(normalized);
        },
        debug: DEBUG
      });
      stopFns.push(stopTwitch);
    } catch (error) {
      console.error('[twitch] Failed to start:', (error as Error).message);
    }
  } else {
    if (DEBUG) console.log('[twitch] skipped (missing env)');
  }

  // TikTok
  if (process.env.TIKTOK_USERNAME) {
    try {
      const stopTikTok = await startTikTok({
        username: process.env.TIKTOK_USERNAME,
        onMessage(evt) {
          const normalized = normalize({ platform: 'tiktok', ...evt });
          broadcast(normalized);
        },
        debug: DEBUG
      });
      stopFns.push(stopTikTok);
    } catch (error) {
      console.error('[tiktok] Failed to start:', (error as Error).message);
    }
  } else {
    if (DEBUG) console.log('[tiktok] skipped (missing env)');
  }

  // YouTube via youtube-chat (no official API key required)
  if (process.env.YT_CHANNEL_ID) {
    console.log('[youtube] starting with channel id:', process.env.YT_CHANNEL_ID);
    try {
      const stopYouTube = await startYouTube({
        channelId: process.env.YT_CHANNEL_ID,
        retryWhenOffline: (process.env.YT_RETRY_WHEN_OFFLINE || 'true').toLowerCase() === 'true',
        onMessage(evt: AdapterEvent) {
          const normalized = normalize({ platform: 'youtube', ...evt });
          broadcast(normalized);
        },
        debug: DEBUG
      });
      stopFns.push(stopYouTube);
    } catch (error) {
      console.error('[youtube] Failed to start:', (error as Error).message);
    }
  } else {
    console.warn('[youtube] skipped: set YT_CHANNEL_ID in your environment to enable YouTube');
  }

  // Fake messages for testing
  if (process.env.FAKE_MESSAGES === "true") {
    const platforms: Platform[] = ["twitch", "youtube", "tiktok"];
    const interval = setInterval(() => {
      console.log('sending fake message...')
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const fakeMsg = normalize({
        platform,
        username: "User" + Math.floor(Math.random() * 1000),
        message: "Hello world " + Math.floor(Math.random() * 100),
        badges: Math.random() > 0.7 ? ["test"] : []
      });
      broadcast(fakeMsg);
    }, 2000);

    stopFns.push(() => clearInterval(interval));
  }
}

// Start server
server.listen(PORT, async () => {
  console.log(`Multichat server running on http://localhost:${PORT}`);
  console.log(`→ WebSocket endpoint: ws://localhost:${PORT}`);
  
  if (isDevelopment) {
    console.log('→ Development mode: Access React app at http://localhost:5173');
    console.log('→ For OBS: http://localhost:5173/?mode=public');
  } else {
    console.log('→ Production mode: React app served from this server');
    console.log('→ For OBS: http://localhost:' + PORT + '/?mode=public');
  }
  
  await initializeAdapters();
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  for (const stop of stopFns) {
    if (typeof stop === 'function') {
      try {
        await stop();
      } catch (error) {
        console.error('Error during shutdown:', (error as Error).message);
      }
    }
  }
  process.exit(0);
});

export { broadcast, normalize };