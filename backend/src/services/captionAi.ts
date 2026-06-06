// Caption generator backed by the Claude API.
// Given an Instagram Reel caption, produces a tighter title, a punchy
// description and a hashtag list tuned for the YouTube Shorts surface.
// The same system prompt is reused on every call, so it's marked for
// prompt caching to keep cost flat.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export interface AiCaption {
  title: string;
  description: string;
  hashtags: string[];
}

const SYSTEM_PROMPT = `Escreves captions para YouTube Shorts em português europeu para um canal de humor/memes chamado "Memes do Camões". O público é português, o tom é cómico, irreverente e identificável (estilo "isto só nos acontece a nós").

Dado o caption original de um Reel do Instagram, escreve:
- Um título YouTube Shorts (max 80 caracteres) — direto, sem emojis acumulados, que crie curiosidade
- Uma descrição (max 200 caracteres) — uma frase atrativa que apetece ler antes de carregar
- 8-12 hashtags em português, em minúsculas, sem # no array, relevantes ao conteúdo

Responde APENAS com JSON válido, sem markdown, sem texto antes ou depois:
{ "title": string, "description": string, "hashtags": string[] }`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!config.ai.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    client = new Anthropic({ apiKey: config.ai.apiKey });
  }
  return client;
}

export async function generateYouTubeCaption(igCaption: string): Promise<AiCaption> {
  const c = getClient();
  const trimmed = (igCaption || '').slice(0, 1500);
  const res = await c.messages.create({
    model: config.ai.model,
    max_tokens: 600,
    system: [{
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{
      role: 'user',
      content: `Caption original do Instagram:\n\n${trimmed || '(sem caption)'}\n\nGera o JSON.`,
    }],
  });

  const block = res.content.find(b => b.type === 'text');
  const text = block && block.type === 'text' ? block.text.trim() : '';
  if (!text) throw new Error('Claude returned no text');

  // Be lenient about ```json fences if the model ever wraps the answer.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<AiCaption>;
  if (!parsed.title || !parsed.description || !Array.isArray(parsed.hashtags)) {
    throw new Error(`Claude payload missing fields: ${cleaned.slice(0, 200)}`);
  }
  return {
    title: parsed.title,
    description: parsed.description,
    hashtags: parsed.hashtags.map(h => h.replace(/^#/, '').trim().toLowerCase()).filter(Boolean),
  };
}
