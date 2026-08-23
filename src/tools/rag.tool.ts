import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { scheduleSave } from '../utils/persistence.js';

// Simple deterministic embedding (hash-based, no external API)
// Dim 128, normalized cosine
const DIM = 128;

function embed(text: string, dim: number = DIM): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) % dim;
    vec[hash] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export type RagDoc = {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
};

// Singleton vector store
const vectorStore = new Map<string, RagDoc>();

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

export function getVectorStore(): Map<string, RagDoc> {
  return vectorStore;
}

export function clearVectorStore(): void {
  vectorStore.clear();
}

// Helpers for hybrid BM25 (v2.2)
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

function computeBM25Scores(query: string, docs: RagDoc[]): Map<string, number> {
  const N = docs.length;
  const avgLen = docs.reduce((sum, d) => sum + tokenize(d.text).length, 0) / (N || 1);
  const queryTokens = tokenize(query);
  // doc freq for query tokens
  const df = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    let count = 0;
    for (const doc of docs) {
      if (tokenize(doc.text).includes(token)) count++;
    }
    df.set(token, count);
  }
  const k1 = 1.5;
  const b = 0.75;
  const scores = new Map<string, number>();
  for (const doc of docs) {
    const docTokens = tokenize(doc.text);
    const docLen = docTokens.length;
    const tfMap = new Map<string, number>();
    for (const t of docTokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);
    let score = 0;
    for (const token of queryTokens) {
      const tf = tfMap.get(token) || 0;
      if (tf === 0) continue;
      const dfVal = df.get(token) || 0;
      const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1);
      const denom = tf + k1 * (1 - b + (b * docLen) / (avgLen || 1));
      score += idf * ((tf * (k1 + 1)) / denom);
    }
    scores.set(doc.id, score);
  }
  return scores;
}

export function hybridSearch(
  query: string,
  docs: RagDoc[],
  mode: 'vector' | 'bm25' | 'hybrid' = 'hybrid',
  alpha = 0.5
): { doc: RagDoc; score: number; vectorScore: number; bm25Score: number }[] {
  const qVec = embed(query);
  const bm25Scores = mode === 'vector' ? new Map<string, number>() : computeBM25Scores(query, docs);
  const maxBm25 = Math.max(0, ...[...bm25Scores.values()]);
  const scored = docs.map(doc => {
    const vectorScore = cosine(qVec, doc.vector);
    const rawBm25 = bm25Scores.get(doc.id) || 0;
    const bm25Norm = maxBm25 > 0 ? rawBm25 / maxBm25 : 0;
    let score: number;
    if (mode === 'vector') score = vectorScore;
    else if (mode === 'bm25') score = bm25Norm;
    else score = alpha * vectorScore + (1 - alpha) * bm25Norm; // hybrid
    return { doc, score, vectorScore, bm25Score: bm25Norm };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function registerRagTools(server: McpServer) {
  server.registerTool(
    'rag_ingest',
    {
      title: 'RAG Ingest',
      description:
        'Ingest text into vector store (chunked, embedded). Use for RAG demo: ingest -> search -> docs:// resource. Embedding is local deterministic (no API key needed); if OPENAI_API_KEY set, could use OpenAI (not implemented in demo).',
      inputSchema: {
        text: z.string().min(1).describe('Text to ingest'),
        id: z.string().optional().describe('Optional doc ID (auto-generated if omitted)'),
        metadata: z.record(z.string()).optional().describe('Metadata key/values'),
        chunk: z
          .boolean()
          .optional()
          .default(true)
          .describe('Chunk text (true) or store as single doc'),
      },
    },
    async ({ text, id, metadata, chunk }) => {
      const chunkSize = config.rag.chunkSize;
      const overlap = config.rag.chunkOverlap;
      const texts = chunk ? chunkText(text, chunkSize, overlap) : [text];
      const ids: string[] = [];
      for (let i = 0; i < texts.length; i++) {
        const docId = id
          ? texts.length > 1
            ? `${id}_chunk_${i}`
            : id
          : `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`;
        const vector = embed(texts[i]);
        const doc: RagDoc = {
          id: docId,
          text: texts[i],
          vector,
          metadata: metadata || {},
          createdAt: new Date().toISOString(),
        };
        vectorStore.set(docId, doc);
        ids.push(docId);
      }
      logger.info('rag_ingest', { ids, chunks: texts.length });
      try {
        server.sendResourceListChanged();
      } catch {}
      scheduleSave();
      return {
        content: [
          {
            type: 'text',
            text: `Ingested ${texts.length} chunk(s): ${ids.join(', ')} (total docs: ${vectorStore.size})`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'rag_search',
    {
      title: 'RAG Search',
      description:
        'Search vector store via hybrid (vector cosine + BM25) with re-rank. Modes: vector, bm25, hybrid (default). Returns topK most relevant chunks.',
      inputSchema: {
        query: z.string().min(1).describe('Search query'),
        topK: z.number().int().min(1).max(20).optional().default(3).describe('Top K results'),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(0.0)
          .describe('Similarity threshold 0-1'),
        mode: z
          .enum(['vector', 'bm25', 'hybrid'])
          .optional()
          .default('hybrid')
          .describe('Search mode'),
      },
    },
    async ({ query, topK, threshold, mode }) => {
      if (vectorStore.size === 0) {
        return { content: [{ type: 'text', text: 'Vector store empty. Use rag_ingest first.' }] };
      }
      const docs = [...vectorStore.values()];
      const scored = hybridSearch(query, docs, (mode as any) || 'hybrid');
      const filtered = scored.filter(s => s.score >= (threshold || 0)).slice(0, topK || 3);
      if (filtered.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No results above threshold ${threshold} for "${query}" (mode=${mode})`,
            },
          ],
        };
      }
      const lines = filtered.map(
        ({ doc, score, vectorScore, bm25Score }) =>
          `score=${score.toFixed(3)} (v=${vectorScore.toFixed(3)} bm25=${bm25Score.toFixed(3)}) id=${doc.id} text="${doc.text.slice(0, 200)}${doc.text.length > 200 ? '...' : ''}" metadata=${JSON.stringify(doc.metadata)}`
      );
      logger.info('rag_search', {
        query: query.slice(0, 50),
        topK,
        mode,
        results: filtered.length,
      });
      return { content: [{ type: 'text', text: lines.join('\n\n') }] };
    }
  );

  server.registerTool(
    'rag_list',
    {
      title: 'RAG List',
      description: 'List all docs in vector store (id, preview)',
      inputSchema: {},
    },
    async () => {
      if (vectorStore.size === 0) {
        return { content: [{ type: 'text', text: 'Vector store empty' }] };
      }
      const lines = [...vectorStore.values()].map(
        d =>
          `${d.id}: "${d.text.slice(0, 80)}${d.text.length > 80 ? '...' : ''}" (${Object.keys(d.metadata).length} meta)`
      );
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.registerTool(
    'rag_clear',
    {
      title: 'RAG Clear',
      description: 'Clear all docs from vector store',
      inputSchema: {},
    },
    async () => {
      const count = vectorStore.size;
      vectorStore.clear();
      try {
        server.sendResourceListChanged();
      } catch {}
      scheduleSave();
      return { content: [{ type: 'text', text: `Cleared ${count} docs` }] };
    }
  );
}
