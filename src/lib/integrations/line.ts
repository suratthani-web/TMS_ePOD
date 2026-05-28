import { messagingApi, validateSignature } from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

// Lazy client instantiation helpers to ensure process.env variables are accessed at runtime (vital for serverless cold-start HMR)
let _lineClient: InstanceType<typeof MessagingApiClient> | null = null;
let _lineBlobClient: InstanceType<typeof MessagingApiBlobClient> | null = null;

export function getLineClient() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not set');
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  }
  if (!_lineClient) {
    _lineClient = new MessagingApiClient({ channelAccessToken: token });
  }
  return _lineClient;
}

export function getLineBlobClient() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not set');
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  }
  if (!_lineBlobClient) {
    _lineBlobClient = new MessagingApiBlobClient({ channelAccessToken: token });
  }
  return _lineBlobClient;
}

/**
 * Validates the signature of an incoming LINE webhook request.
 */
export function verifyLineSignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET is not set');
    return false;
  }
  return validateSignature(body, channelSecret, signature);
}

/**
 * Fetches binary content (audio, image, etc.) from LINE servers.
 */
export async function getMessageContent(messageId: string): Promise<Buffer> {
  const client = getLineBlobClient();
  const stream = await client.getMessageContent(messageId) as any;
  
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', (err: any) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Sends a reply message to a LINE user.
 */
export async function replyToUser(replyToken: string, text: string) {
  try {
    const client = getLineClient();
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }]
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending LINE reply:', error);
    return { success: false, error };
  }
}

/**
 * Sends a push message to a LINE user.
 */
export async function pushToUser(to: string, text: string) {
  try {
    const client = getLineClient();
    await client.pushMessage({
      to,
      messages: [{ type: 'text', text }]
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending LINE push:', error);
    return { success: false, error };
  }
}
