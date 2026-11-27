import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleExtractMindHttp } from './_lib/mindExtract';

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  const result = await handleExtractMindHttp({
    method: request.method,
    authorizationHeader: request.headers.authorization,
    body: request.body,
  });

  for (const [key, value] of Object.entries(result.headers)) {
    response.setHeader(key, value);
  }
  response.status(result.status).json(result.body);
}
