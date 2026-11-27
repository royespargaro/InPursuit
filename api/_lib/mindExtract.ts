import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import { z } from 'zod';
import {
  checkUserRateLimit,
  ImportHttpError,
  MAX_IMPORT_REQUEST_BYTES,
  verifyImportRequestAuth,
  type AuthenticatedImportUser,
  type HttpResponseResult,
  type RateLimitDecision,
  type TokenVerifier,
} from './importAuth';

export const MAX_MIND_NOTES_CHARS = 18_000;
const GEMINI_MIND_MODEL = 'gemini-4-hydrogen';

const ExtractMindRequestSchema = z.object({
  notesText: z
    .string()
    .trim()
    .min(10, 'Please enter at least a few words of notes or reflections to extract.')
    .max(MAX_MIND_NOTES_CHARS, `Notes text cannot exceed ${MAX_MIND_NOTES_CHARS.toLocaleString()} characters.`),
  sourceLabel: z.string().trim().max(120).optional(),
});

const MIND_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    domains: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Distinct intellectual domains or life areas represented in the text.',
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: ['Concept', 'Question', 'Goal', 'Project', 'Hypothesis', 'Principle'],
          },
          domain: { type: Type.STRING },
          description: { type: Type.STRING },
          evidence_grade: { type: Type.STRING, enum: ['Q1', 'Q2', 'Q3', 'Q4'] },
        },
        required: ['title', 'type', 'domain', 'description', 'evidence_grade'],
      },
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceTitle: { type: Type.STRING },
          targetTitle: { type: Type.STRING },
          relationship: { type: Type.STRING },
          basis: {
            type: Type.STRING,
            enum: ['explicit', 'user_suggested', 'co_discussed', 'inferred'],
          },
          explanation: { type: Type.STRING },
        },
        required: ['sourceTitle', 'targetTitle', 'relationship', 'basis', 'explanation'],
      },
    },
  },
  required: ['domains', 'nodes', 'edges'],
};

const ExtractedMindResponseSchema = z.object({
  domains: z.array(z.string().trim().min(1).max(80)).max(12),
  nodes: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(140),
        type: z.enum(['Concept', 'Question', 'Goal', 'Project', 'Hypothesis', 'Principle']),
        domain: z.string().trim().min(1).max(80),
        description: z.string().trim().max(600),
        evidence_grade: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
      })
    )
    .max(35),
  edges: z
    .array(
      z.object({
        sourceTitle: z.string().trim().min(1).max(140),
        targetTitle: z.string().trim().min(1).max(140),
        relationship: z.string().trim().min(1).max(60),
        basis: z.enum(['explicit', 'user_suggested', 'co_discussed', 'inferred']),
        explanation: z.string().trim().max(320),
      })
    )
    .max(40),
});

export type ExtractedMindOutput = z.infer<typeof ExtractedMindResponseSchema> & {
  sourceLabel: string;
};

export async function extractMindWithGemini(
  notesText: string,
  sourceLabel = 'Personal Notes Synthesis'
): Promise<ExtractedMindOutput> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ImportHttpError(503, 'AI extraction is not configured on the server.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: GEMINI_MIND_MODEL,
    contents: `Extract a clean, honest personal knowledge graph from the user's text below.\n\nRules:\n- Stay strictly grounded in what the user actually wrote.\n- Use "explicit" basis only when the connection is clearly stated; mark speculative/cross-topic links as "inferred" so the user can review them.\n- Mark practiced habits/projects as Q3, direct statements/summaries as Q2, and tentative ideas/questions as Q1.\n- Keep node titles crisp (2-8 words).\n\nUser notes:\n"""\n${notesText}\n"""`,
    config: {
      systemInstruction:
        'You organize personal notes into a structured intellectual graph of domains, concepts/questions/goals/projects, and grounded or inferred connections. Return valid JSON matching the schema.',
      responseMimeType: 'application/json',
      responseSchema: MIND_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Model returned empty mind extraction response.');
  }

  const parsedJson = JSON.parse(rawText) as unknown;
  const validated = ExtractedMindResponseSchema.parse(parsedJson);
  return {
    ...validated,
    sourceLabel: sourceLabel.trim().slice(0, 120) || 'Personal Notes Synthesis',
  };
}

export interface HandleExtractMindParams {
  method?: string;
  authorizationHeader?: string;
  body: unknown;
  rawBodyBytes?: number;
  nowMs?: number;
  verifyToken?: TokenVerifier;
  rateLimiter?: (uid: string, nowMs: number) => RateLimitDecision;
  extractor?: (notesText: string, sourceLabel?: string) => Promise<ExtractedMindOutput>;
}

export async function handleExtractMindHttp(
  params: HandleExtractMindParams
): Promise<HttpResponseResult> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
  };

  if (params.method !== 'POST') {
    return {
      status: 405,
      headers: { ...headers, Allow: 'POST' },
      body: { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', retryable: false },
    };
  }

  let authUser: AuthenticatedImportUser;
  try {
    authUser = await verifyImportRequestAuth(params.authorizationHeader, params.verifyToken);
  } catch (err) {
    const status = err instanceof ImportHttpError ? err.status : 401;
    const message = err instanceof Error ? err.message : 'Unauthorized.';
    return {
      status,
      headers,
      body: { error: message, code: 'UNAUTHORIZED', retryable: false },
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const limitDecision = (params.rateLimiter ?? ((uid, ts) => checkUserRateLimit(uid, ts)))(
    authUser.uid,
    nowMs
  );
  if (!limitDecision.allowed) {
    return {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': String(limitDecision.retryAfterSeconds),
      },
      body: {
        error: `Too many requests. Please wait ${limitDecision.retryAfterSeconds} seconds before trying again.`,
        code: 'AI_RATE_LIMITED',
        retryable: true,
      },
    };
  }

  const bodyBytes =
    params.rawBodyBytes ??
    (params.body !== undefined
      ? Buffer.byteLength(
          typeof params.body === 'string' ? params.body : JSON.stringify(params.body),
          'utf8'
        )
      : 0);

  if (bodyBytes > MAX_IMPORT_REQUEST_BYTES) {
    return {
      status: 413,
      headers,
      body: {
        error: `Request payload too large. Maximum size is ${Math.round(MAX_IMPORT_REQUEST_BYTES / 1024)}KB.`,
        code: 'PAYLOAD_TOO_LARGE',
        retryable: false,
      },
    };
  }

  const parsed = ExtractMindRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      status: 400,
      headers,
      body: {
        error: parsed.error.issues[0]?.message ?? 'Invalid mind extraction request.',
        code: 'INVALID_REQUEST',
        retryable: false,
      },
    };
  }

  try {
    const result = await (params.extractor ?? extractMindWithGemini)(
      parsed.data.notesText,
      parsed.data.sourceLabel
    );
    return {
      status: 200,
      headers,
      body: result,
    };
  } catch (error) {
    if (error instanceof ImportHttpError) {
      return {
        status: error.status,
        headers,
        body: { error: error.message, code: 'AI_UNCONFIGURED', retryable: false },
      };
    }
    return {
      status: 503,
      headers,
      body: {
        error: 'Note extraction service is temporarily busy. You can still use instant local parsing.',
        code: 'AI_BUSY',
        retryable: true,
      },
    };
  }
}
