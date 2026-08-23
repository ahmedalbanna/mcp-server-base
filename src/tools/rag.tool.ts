import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

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
        'Search vector store via cosine similarity (local embedding). Returns topK most relevant chunks.',
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
      },
    },
    async ({ query, topK, threshold }) => {
      if (vectorStore.size === 0) {
        return { content: [{ type: 'text', text: 'Vector store empty. Use rag_ingest first.' }] };
      }
      const qVec = embed(query);
      const scored = [...vectorStore.values()].map(doc => ({
        doc,
        score: cosine(qVec, doc.vector),
      }));
      scored.sort((a, b) => b.score - a.score);
      const filtered = scored.filter(s => s.score >= (threshold || 0)).slice(0, topK || 3);
      if (filtered.length === 0) {
        return {
          content: [
            { type: 'text', text: `No results above threshold ${threshold} for "${query}"` },
          ],
        };
      }
      const lines = filtered.map(
        ({ doc, score }) =>
          `score=${score.toFixed(3)} id=${doc.id} text="${doc.text.slice(0, 200)}${doc.text.length > 200 ? '...' : ''}" metadata=${JSON.stringify(doc.metadata)}`
      );
      logger.info('rag_search', { query: query.slice(0, 50), topK, results: filtered.length });
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
      return { content: [{ type: 'text', text: `Cleared ${count} docs` }] };
    }
  );
}
