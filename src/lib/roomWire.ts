const ORIGIN = "https://backend.hutianhuilixiang.cyou";
const ID = /^[a-f0-9]{24}$/;

export type RoomWire = {
  clientId: string;
  accessToken: string;
  expiresAt: number;
};

type RawMsg = {
  _id?: string;
  channelId?: string;
  content?: string;
  createdAt?: string;
  editedAt?: string | null;
  system?: boolean;
  commandKind?: string;
  authorId?: {
    _id?: string;
    id?: string;
    username?: string;
    avatar?: string;
    color?: string;
    rank?: string;
  };
  replyToId?: {
    _id?: string;
    content?: string;
    authorId?: { username?: string };
  } | null;
  attachments?: string[];
  gif?: { url?: string } | null;
};

function pic(raw: string) {
  const s = String(raw || "");
  if (!s) return "";
  try {
    const u = /^https?:\/\//i.test(s) ? new URL(s) : new URL(s, ORIGIN);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    const host = u.hostname;
    const ours =
      host === "vtx.chat" ||
      host.endsWith(".vtx.chat") ||
      host === "backend.hutianhuilixiang.cyou";
    if (ours) {
      const path = u.pathname.replace(/\/+$/, "") || "/";
      if (path === "/img/uploads/843aa3394cd9e5d5") return "/storage/images/vortex-petezah.webp";
      if (path.startsWith("/img/") && !path.includes("..")) {
        return "/api/chat/pic?p=" + encodeURIComponent(u.pathname);
      }
      return "";
    }
    return u.href;
  } catch {
    return "";
  }
}

function shapeMessage(m: RawMsg, channelId: string) {
  const a = m?.authorId && typeof m.authorId === "object" ? m.authorId : {};
  const reply = m?.replyToId && typeof m.replyToId === "object" ? m.replyToId : null;
  return {
    id: String(m?._id || ""),
    channelId: String(channelId || m?.channelId || ""),
    content: String(m?.content || "").slice(0, 2000),
    author: {
      id: String(a._id || a.id || ""),
      username: String(a.username || "Unknown").slice(0, 64),
      avatar: pic(a.avatar || ""),
      color: String(a.color || "").slice(0, 80),
      rank: String(a.rank || "").slice(0, 24),
    },
    at: Date.parse(m?.createdAt || "") || Date.now(),
    edited: m?.editedAt ? Date.parse(m.editedAt) || 0 : 0,
    system: !!m?.system,
    kind: String(m?.commandKind || "").slice(0, 40),
    reply: reply
      ? {
          id: String(reply._id || ""),
          content: String(reply.content || "").slice(0, 180),
          author: String(reply.authorId?.username || "Unknown").slice(0, 64),
        }
      : null,
    images: (Array.isArray(m?.attachments) ? m.attachments : []).slice(0, 4).map(pic).filter(Boolean),
    gif: m?.gif?.url ? pic(m.gif.url) : "",
  };
}

function revOf(messages: { id: string; edited: number }[]) {
  const last = messages[messages.length - 1];
  if (!last) return "0";
  return `${messages.length}:${last.id}:${last.edited || 0}`;
}

let pass: RoomWire | null = null;
let passWait: Promise<RoomWire | null> | null = null;

export function holdWire(next: RoomWire | null | undefined) {
  if (!next?.accessToken || !next?.clientId) {
    pass = null;
    return;
  }
  pass = {
    clientId: String(next.clientId).slice(0, 40),
    accessToken: String(next.accessToken),
    expiresAt: Number(next.expiresAt) || 0,
  };
}

export function clearWire() {
  pass = null;
}

async function refreshPass() {
  if (passWait) return passWait;
  passWait = fetch("/api/chat/pass", { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data?.accessToken || !data?.clientId) return null;
      holdWire(data);
      return pass;
    })
    .catch(() => null)
    .finally(() => {
      passWait = null;
    });
  return passWait;
}

async function readyPass() {
  if (pass && pass.expiresAt - Date.now() > 90000) return pass;
  return refreshPass();
}

async function call(method: string, path: string, body?: unknown, retried = false): Promise<{ ok: boolean; status: number; data: any }> {
  const wire = await readyPass();
  if (!wire) return { ok: false, status: 0, data: null };
  const url = new URL(`${ORIGIN}/api/partner/v1${path}`);
  url.searchParams.set("client_id", wire.clientId);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${wire.accessToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(9000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !retried) {
      holdWire(null);
      const again = await refreshPass();
      if (again) return call(method, path, body, true);
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function wireFeed(channelId: string, rev: string) {
  if (!ID.test(channelId)) return null;
  const q = new URLSearchParams({ limit: "40" });
  const { ok, data } = await call("GET", `/chat/channels/${channelId}/messages?${q}`);
  if (!ok) return null;
  const messages = (Array.isArray(data?.messages) ? data.messages : [])
    .map((m: RawMsg) => shapeMessage(m, channelId))
    .filter((m: { id: string }) => m.id);
  const next = revOf(messages);
  if (rev && rev === next) {
    return { unchanged: true as const, rev: next, hasMore: !!data?.hasMore, messages };
  }
  return { unchanged: false as const, rev: next, hasMore: !!data?.hasMore, messages };
}

export async function wireHistory(channelId: string, before: string) {
  if (!ID.test(channelId) || !ID.test(before)) return null;
  const q = new URLSearchParams({ limit: "40", before });
  const { ok, data } = await call("GET", `/chat/channels/${channelId}/messages?${q}`);
  if (!ok) return null;
  const messages = (Array.isArray(data?.messages) ? data.messages : [])
    .map((m: RawMsg) => shapeMessage(m, channelId))
    .filter((m: { id: string }) => m.id);
  return { messages, hasMore: !!data?.hasMore };
}

export async function wirePresence(channelId: string) {
  if (!ID.test(channelId)) return null;
  const { ok, data } = await call("GET", `/guild/online?channelId=${encodeURIComponent(channelId)}`);
  if (!ok) return null;
  const groups = (Array.isArray(data?.groups) ? data.groups : []).slice(0, 10).map((group: any) => ({
    role: group?.role
      ? {
          name: String(group.role.name || "").slice(0, 32),
          color: String(group.role.color || "").match(/#[0-9a-fA-F]{6}/)?.[0] || "",
        }
      : null,
    members: (Array.isArray(group?.members) ? group.members : []).slice(0, 40).map((member: any) => ({
      id: String(member?.id || ""),
      username: String(member?.username || "Unknown").slice(0, 64),
      avatar: pic(member?.avatar || ""),
      color: String(member?.color || "").match(/#[0-9a-fA-F]{6}/)?.[0] || "",
      status: String(member?.status || "").slice(0, 16),
    })),
  }));
  return { count: Number(data?.count) || 0, groups, typing: [] as string[] };
}

export async function wireAcceptRules() {
  const { ok } = await call("POST", "/guild/rules/accept");
  return ok;
}

export async function wireSend(channelId: string, content: string, replyTo?: string) {
  if (!ID.test(channelId) || !content) return { ok: false as const, error: "That message could not be sent." };
  let attempt = await call("POST", `/chat/channels/${channelId}/messages`, {
    content,
    ...(replyTo && ID.test(replyTo) ? { replyToId: replyTo } : {}),
  });
  if (!attempt.ok && (attempt.status === 403 || /rules/i.test(String(attempt.data?.message || "")))) {
    await wireAcceptRules();
    attempt = await call("POST", `/chat/channels/${channelId}/messages`, {
      content,
      ...(replyTo && ID.test(replyTo) ? { replyToId: replyTo } : {}),
    });
  }
  if (!attempt.ok) {
    return {
      ok: false as const,
      error: String(attempt.data?.message || "That message could not be sent.").slice(0, 180),
      needRules: /rules/i.test(String(attempt.data?.message || "")),
    };
  }
  if (attempt.data?.command) {
    return {
      ok: true as const,
      command: { ok: !!attempt.data.ok, text: String(attempt.data.message || "").slice(0, 500) },
      message: null,
    };
  }
  return {
    ok: true as const,
    message: attempt.data?.message ? shapeMessage(attempt.data.message, channelId) : null,
    command: null,
  };
}

export async function wireEdit(channelId: string, messageId: string, content: string) {
  if (!ID.test(channelId) || !ID.test(messageId) || !content) return null;
  const { ok, data } = await call("PATCH", `/chat/channels/${channelId}/messages/${messageId}`, { content });
  if (!ok || !data?.message) return null;
  return shapeMessage(data.message, channelId);
}

export async function wireDelete(channelId: string, messageId: string) {
  if (!ID.test(channelId) || !ID.test(messageId)) return false;
  const { ok } = await call("DELETE", `/chat/channels/${channelId}/messages/${messageId}`);
  return ok;
}

export async function wireBootBits() {
  const guild = await call("GET", "/guild");
  if (!guild.ok) return null;
  const channels = (Array.isArray(guild.data?.channels) ? guild.data.channels : []).map((c: any) => ({
    id: String(c?.id || ""),
    name: String(c?.name || "room").slice(0, 40),
    description: String(c?.description || "").slice(0, 140),
    category: String(c?.category || "").slice(0, 40),
    slowmodeSeconds: Number(c?.slowmodeSeconds) || 0,
    readOnly: !!c?.readOnly,
    locked: !!c?.locked,
    editable: c?.editable !== false,
    canSend: !!c?.canSend,
  })).filter((c: { id: string }) => ID.test(c.id));
  const g = guild.data?.guild || {};
  const rules = guild.data?.rules
    ? {
        accepted: !!guild.data.rules.accepted,
        items: (Array.isArray(guild.data.rules.items) ? guild.data.rules.items : []).slice(0, 24).map((r: any) => ({
          title: String(r?.title || "").slice(0, 80),
          description: String(r?.description || "").slice(0, 600),
          locked: !!r?.locked,
        })),
      }
    : null;
  const standing = guild.data?.standing
    ? {
        muted: !!guild.data.standing.muted,
        timedOut: !!guild.data.standing.timedOut,
        until: Date.parse(guild.data.standing.timeoutUntil || guild.data.standing.mutedUntil || "") || 0,
      }
    : null;
  const powers = guild.data?.permissions
    ? {
        messages: !!guild.data.permissions.manageMessages,
        timeout: !!guild.data.permissions.timeout,
        ban: !!guild.data.permissions.ban,
        roles: !!guild.data.permissions.manageRoles,
        channels: !!guild.data.permissions.manageChannels,
      }
    : null;
  const me = await call("GET", "/me");
  const user = me.ok ? me.data?.user : null;
  const channelId = channels.find((c: { name: string }) => c.name.toLowerCase() === "general")?.id || channels[0]?.id || "";
  let messages: ReturnType<typeof shapeMessage>[] = [];
  let hasMore = false;
  let rev = "0";
  if (channelId) {
    const feed = await wireFeed(channelId, "");
    if (feed) {
      messages = feed.messages;
      hasMore = feed.hasMore;
      rev = feed.rev;
    }
  }
  const emotesRes = await call("GET", "/emotes");
  const emotes: Record<string, string> = {};
  if (emotesRes.ok) {
    for (const [name, val] of Object.entries(emotesRes.data?.emotes || {}).slice(0, 120)) {
      const key = String(name || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
      const src = pic((val as any)?.src || "");
      if (key && src) emotes[key] = src;
    }
  }
  return {
    live: true,
    join: true,
    guild: {
      name: String(g.name || "PeteZah").slice(0, 64),
      tag: String(g.tag || "").slice(0, 12),
      icon: pic(g.icon || g.logo || ""),
      ownerId: String(g.ownerId || ""),
    },
    channels,
    channelId,
    messages,
    hasMore,
    rev,
    emotes,
    viewer: user
      ? {
          id: String(user.id || ""),
          username: String(user.username || "Member").slice(0, 64),
          avatar: pic(user.avatar || ""),
          color: String(user.color || "").slice(0, 80),
          rank: String(user.rank || "").slice(0, 24),
        }
      : null,
    powers,
    standing,
    roles: [],
    rules,
    announcements: [] as { id: string; title: string; content: string; important?: number | boolean }[],
  };
}
