import type { WhatsAppParsedAction } from '../types';
import { appliableActions } from './whatsappAction';

export type BuddyChatTurn = {
  role: 'user' | 'buddy';
  text: string;
};

export const BUDDY_WELCOME =
  "Hey! I'm your kitchen buddy. Tell me what to update in plain language — I'll confirm before anything changes.";

export const BUDDY_QUICK_PROMPTS = [
  'Milk khatam, add to shopping list',
  'Log dal for dinner',
  'Tomatoes 2 kg add to pantry',
  'Paneer expired',
] as const;

const GREETING_RE = /^(hi|hello|hey|namaste|good\s+(morning|afternoon|evening))\b/i;
const THANKS_RE = /^(thanks|thank you|thx|dhanyavad|shukriya)\b/i;
const HELP_RE = /^(help|what can you do|how does this work)\??$/i;
const CANCEL_RE = /^(cancel|never\s?mind|stop|leave it|skip)\b/i;
const CORRECTION_RE =
  /^(no|nope|wrong|not that|that's wrong|that is wrong|i meant|i mean|something else|actually|wait)\b/i;

type LocalReplyContext = {
  hasPendingTasks: boolean;
};

/** Fast local replies — no API round-trip for chit-chat and corrections. */
export function tryLocalBuddyReply(text: string, ctx: LocalReplyContext): string | null {
  const t = text.trim();
  if (!t) return null;

  if (GREETING_RE.test(t)) {
    return "Hey! What should I update in your kitchen today? You can combine a few things in one message.";
  }
  if (THANKS_RE.test(t)) {
    return "You're welcome! Anything else for the kitchen?";
  }
  if (HELP_RE.test(t)) {
    return [
      'I can help you:',
      '• Add items to shopping list or pantry',
      '• Mark something out of stock / expired',
      '• Log what was cooked',
      '• Save food preferences',
      '',
      'Example: "milk khatam, shopping list mein daalo"',
    ].join('\n');
  }
  if (CANCEL_RE.test(t)) {
    return "Okay, I won't change anything. Tell me when you're ready.";
  }
  if (ctx.hasPendingTasks && CORRECTION_RE.test(t)) {
    return "No worries — what did you mean instead? Say the full update in one message.";
  }

  return null;
}

export function buildParseHistory(messages: BuddyChatTurn[], maxTurns = 8): BuddyChatTurn[] {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .slice(-maxTurns);
}

const INTENT_ICONS: Record<string, string> = {
  add_to_shopping_list: '🛒',
  mark_out_of_stock: '📦',
  add_inventory: '➕',
  note_dislike: '👎',
  report_cooked_dish: '🍽️',
};

export function taskCardLabel(action: WhatsAppParsedAction): string {
  const icon = INTENT_ICONS[action.intent] ?? '•';
  const summary = action.summary?.trim();
  if (summary && summary !== 'Suggested action' && !summary.startsWith('Could not understand')) {
    return `${icon} ${summary}`;
  }
  const e = action.entities;
  if (action.intent === 'add_to_shopping_list' && e.item_name) {
    return `${icon} Add ${e.item_name} to shopping list`;
  }
  if (action.intent === 'mark_out_of_stock' && e.item_name) {
    return `${icon} Mark ${e.item_name} as out of stock`;
  }
  if (action.intent === 'add_inventory' && e.item_name) {
    const qty = e.qty && e.qty !== 1 ? `${e.qty} ${e.unit || 'pcs'} ` : '';
    return `${icon} Add ${qty}${e.item_name} to pantry`;
  }
  if (action.intent === 'report_cooked_dish' && e.dish_name) {
    const slot = e.meal_slot ? ` (${e.meal_slot})` : '';
    return `${icon} Log ${e.dish_name}${slot} as cooked`;
  }
  if (action.intent === 'note_dislike' && (e.item_name || e.note)) {
    return `${icon} Save preference: don't like ${e.item_name || e.note}`;
  }
  return `${icon} ${summary || 'Update kitchen'}`;
}

export function buddyReplyForActions(
  actions: WhatsAppParsedAction[],
  serverReply?: string,
): { reply: string; appliable: WhatsAppParsedAction[] } {
  const appliable = appliableActions(actions);
  const reply = serverReply?.trim();

  if (appliable.length === 0) {
    return {
      reply:
        reply ||
        "I'm not sure what to update yet. Try something like \"milk khatam, add to list\" or \"log dal for dinner\".",
      appliable: [],
    };
  }

  if (reply) {
    return { reply, appliable };
  }

  if (appliable.length === 1) {
    return {
      reply: `Here's what I'll do — tap Confirm when it looks right.`,
      appliable,
    };
  }

  return {
    reply: `I found ${appliable.length} things to update. Tap Confirm when this looks right.`,
    appliable,
  };
}

export function buddySuccessReply(message: string, count: number): string {
  if (message?.trim()) return message.trim();
  return count === 1 ? 'Done! Your kitchen is updated.' : `Done! ${count} updates applied.`;
}
