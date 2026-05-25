export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  details: string;
  keywords: string[];
  related: string[];
  shortcuts: string[];
}

export interface HelpContext {
  id?: string;
  label?: string;
  text?: string;
  role?: string;
  keywords?: string[];
}

const HELP_TOPICS: HelpTopic[] = [
  {
    id: "scene-editor",
    title: "Scene Editor",
    summary: "Place, move, and frame objects in the world.",
    details: "Use the Scene Editor to arrange actors, ground, sky, and camera framing before you script behavior.",
    keywords: ["scene", "layout", "camera", "world", "place object"],
    related: ["gallery", "resource-manager", "run-world"],
    shortcuts: ["Drag to orbit", "Shift+drag to pan"],
  },
  {
    id: "code-editor",
    title: "Code Editor",
    summary: "Author Tweedle procedures, functions, and control flow.",
    details: "The Code Editor is where Alice logic lives: procedures, functions, loops, conditionals, and comments.",
    keywords: ["code", "tweedle", "procedure", "function", "loop", "conditional"],
    related: ["declaration-editor", "events", "run-world"],
    shortcuts: ["Ctrl+S to save", "Tab to indent"],
  },
  {
    id: "gallery",
    title: "Gallery",
    summary: "Browse characters, props, and world assets.",
    details: "The Gallery helps you discover reusable scene objects and add them to the current project.",
    keywords: ["assets", "objects", "characters", "props", "browse"],
    related: ["scene-editor", "resource-manager"],
    shortcuts: ["Double-click to inspect"],
  },
  {
    id: "resource-manager",
    title: "Resource Manager",
    summary: "Track external models, textures, and audio resources.",
    details: "Use the Resource Manager to understand what files a project depends on and whether they are already cached.",
    keywords: ["resource", "cache", "texture", "model", "audio"],
    related: ["gallery", "scene-editor"],
    shortcuts: ["Refresh to reload assets"],
  },
  {
    id: "declaration-editor",
    title: "Declaration Editor",
    summary: "Create fields, methods, and type-level structure.",
    details: "The Declaration Editor organizes the members that define a scene class or custom type.",
    keywords: ["declaration", "members", "fields", "methods", "types"],
    related: ["code-editor", "type-browser"],
    shortcuts: ["Enter to confirm names"],
  },
  {
    id: "type-browser",
    title: "Type Browser",
    summary: "Inspect available APIs for the selected object.",
    details: "The Type Browser explains what methods, properties, and events are available on the current selection.",
    keywords: ["api", "methods", "properties", "events", "type"],
    related: ["code-editor", "events"],
    shortcuts: ["Filter to narrow members"],
  },
  {
    id: "events",
    title: "Events & Interactions",
    summary: "Attach input, collision, and trigger-driven behavior.",
    details: "Use Events to react to keyboard, mouse, collision, or scene triggers without polling every frame.",
    keywords: ["event", "collision", "listener", "keyboard", "mouse", "interaction"],
    related: ["code-editor", "run-world"],
    shortcuts: ["Choose a trigger, then add a handler"],
  },
  {
    id: "run-world",
    title: "Run World",
    summary: "Preview the program and verify behavior.",
    details: "Run World executes the current project so you can confirm scene setup, animation timing, and interaction logic.",
    keywords: ["run", "play", "preview", "test", "world"],
    related: ["scene-editor", "code-editor", "events"],
    shortcuts: ["Use the play button to launch"],
  },
];

const HELP_BY_ID = new Map(HELP_TOPICS.map((topic) => [topic.id, topic]));
const HELP_ALIASES = new Map<string, string>([
  ["scene-canvas", "scene-editor"],
  ["scene-view", "scene-editor"],
  ["editor", "code-editor"],
  ["code-panel", "code-editor"],
  ["assets-browser", "gallery"],
  ["asset-gallery", "gallery"],
  ["resources", "resource-manager"],
  ["member-browser", "type-browser"],
  ["event-editor", "events"],
  ["run-button", "run-world"],
  ["play-button", "run-world"],
]);

export function listHelpTopics(): HelpTopic[] {
  return HELP_TOPICS.map(cloneTopic);
}

export function getHelpTopic(id: string): HelpTopic | null {
  const normalized = normalize(id);
  const canonical = HELP_ALIASES.get(normalized) ?? normalized;
  const topic = HELP_BY_ID.get(canonical);
  return topic ? cloneTopic(topic) : null;
}

export function searchHelpTopics(query: string, limit = 5): HelpTopic[] {
  const normalized = normalize(query);
  if (!normalized) {
    return [];
  }
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return HELP_TOPICS
    .map((topic) => ({ topic, score: scoreTopic(topic, normalized, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.topic.title.localeCompare(right.topic.title))
    .slice(0, limit)
    .map((entry) => cloneTopic(entry.topic));
}

export function getContextualHelp(context: string | HelpContext): HelpTopic | null {
  if (typeof context === "string") {
    return getHelpTopic(context) ?? searchHelpTopics(context, 1)[0] ?? null;
  }

  const directCandidates = [context.id, context.label, context.role];
  for (const candidate of directCandidates) {
    if (!candidate) continue;
    const direct = getHelpTopic(candidate);
    if (direct) {
      return direct;
    }
  }

  const searchTerms = [context.label, context.text, context.role, ...(context.keywords ?? [])]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");

  return searchHelpTopics(searchTerms, 1)[0] ?? null;
}

function scoreTopic(topic: HelpTopic, query: string, tokens: string[]): number {
  let score = 0;
  if (topic.id === query) score += 100;
  if (normalize(topic.title) === query) score += 90;
  if (normalize(topic.title).includes(query)) score += 50;
  if (normalize(topic.summary).includes(query)) score += 25;
  if (normalize(topic.details).includes(query)) score += 20;
  for (const token of tokens) {
    if (topic.id.includes(token)) score += 20;
    if (normalize(topic.title).includes(token)) score += 18;
    if (topic.keywords.some((keyword) => normalize(keyword).includes(token))) score += 15;
    if (topic.related.some((related) => related.includes(token))) score += 5;
  }
  return score;
}

function cloneTopic(topic: HelpTopic): HelpTopic {
  return {
    ...topic,
    keywords: [...topic.keywords],
    related: [...topic.related],
    shortcuts: [...topic.shortcuts],
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
