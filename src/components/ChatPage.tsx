import { CSSProperties, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, Crown, Flag, Hash, Loader2, LogOut, Pencil, Plus, Reply, Send, Shield, Trash2, Users, VolumeX, X } from "lucide-react";

type Channel = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  slowmodeSeconds: number;
  canSend: boolean;
  readOnly?: boolean;
  locked?: boolean;
  editable?: boolean;
};
type Person = { id: string; username: string; avatar: string; color?: string; rank?: string; owner?: boolean };
type Powers = { messages: boolean; timeout: boolean; ban: boolean; roles: boolean; channels: boolean };
type RoleChip = { id?: string; name: string; color: string };
type Card = {
  id: string;
  username: string;
  avatar: string;
  rank: string;
  color: string;
  owner: boolean;
  staff: boolean;
  joinedAt: number;
  timeoutUntil: number;
  banned: boolean;
  roles: RoleChip[];
};
type ReplyRef = { id: string; content: string; author: string };
type Note = {
  id: string;
  channelId: string;
  content: string;
  author: Person;
  at: number;
  edited: number;
  system: boolean;
  kind: string;
  reply: ReplyRef | null;
  images: string[];
  gif: string;
};
type Rule = { title: string; description: string; locked?: boolean };
type Announcement = { id: string; title: string; content: string; important?: number | boolean };
type Seat = { id: string; username: string; avatar: string; color: string; status: string };
type Group = { role: { name: string; color: string } | null; members: Seat[] };
type Cmd = { name: string; usage: string; description: string; moderation: boolean };
type AuditRow = { id: string; action: string; category: string; message: string; at: number; by: string };
type Standing = { muted: boolean; timedOut: boolean; until: number };
type Boot = {
  live: boolean;
  join: boolean;
  guild: { name: string; tag: string; icon?: string; ownerId?: string };
  channels: Channel[];
  channelId: string;
  messages: Note[];
  hasMore: boolean;
  rev: string;
  emotes: Record<string, string>;
  viewer: Person | null;
  powers: Powers | null;
  roles: RoleChip[];
  standing: Standing | null;
  rules: { accepted: boolean; items: Rule[] } | null;
  announcements: Announcement[];
  error?: string;
};
type ChannelDraft = {
  id: string;
  name: string;
  description: string;
  category: string;
  slowmodeSeconds: number;
  readOnly: boolean;
  discordChannelId: string;
};

const face = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const REASONS = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["hate_speech", "Hate"],
  ["nsfw", "NSFW"],
  ["self_harm", "Self-harm"],
  ["other", "Other"],
] as const;

const roomCss = `
.pz-room{--vx-accent:hsl(213 72% 68%);--vx-accent2:hsl(213 55% 32%);--vx-surface:hsla(216,30%,8%,.62);--vx-surface-2:hsla(216,28%,12%,.72);--vx-border:hsl(213 32% 38% / .55);--vx-text:#fff;--vx-muted:hsl(216 16% 74%);--vx-danger:#ff4d4d;--vx-radius:5px;--vx-font-size:14px;position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;height:100%;background:transparent;color:var(--vx-text);font-family:${face};font-size:var(--vx-font-size)}
.pz-room button,.pz-room input,.pz-room select,.pz-room textarea{font:inherit;color:inherit}
.pz-room button{cursor:pointer}
.pz-header{display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:54px;background:hsla(220,50%,4%,.58);border-bottom:1px solid var(--vx-border)}
.pz-logo{width:32px;height:32px;border-radius:var(--vx-radius);object-fit:cover}
.pz-header-text{display:flex;flex-direction:column;min-width:0;flex:1}
.pz-header-text strong,.pz-header-text span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pz-header-text strong{font-weight:700;letter-spacing:.02em}
.pz-header-text span{color:var(--vx-muted);font-size:.85em}
.pz-channel-select{display:none;max-width:40%;background:var(--vx-surface-2);border:2px solid var(--vx-border);border-radius:5px;padding:6px 8px}
.pz-icon-btn{display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;padding:4px;border-radius:5px;color:var(--vx-muted)}
.pz-icon-btn:hover{color:var(--vx-text);background:var(--vx-surface-2)}
.pz-online-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:none;border-radius:999px;background:transparent;color:var(--vx-muted)}
.pz-online-btn.active,.pz-online-btn:hover{color:var(--vx-text);background:var(--vx-surface-2)}
.pz-online-count{font-size:.82em;font-weight:600}
.pz-account-btn{display:inline-flex;align-items:center;gap:8px;max-width:45%;padding:3px 6px 3px 3px;border:1px solid var(--vx-border);border-radius:999px;background:var(--vx-surface-2);color:var(--vx-text)}
.pz-account-btn:hover{border-color:color-mix(in srgb,var(--vx-accent) 55%,var(--vx-border))}
.pz-account-btn img{width:28px;height:28px;border-radius:50%;object-fit:cover}
.pz-account-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9em}
.pz-body{display:flex;flex:1;min-height:0;position:relative}
.pz-channels{width:180px;flex-shrink:0;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:2px;background:hsla(220,48%,4%,.58);border-right:1px solid var(--vx-border)}
.pz-cat{color:var(--vx-muted);font-size:.75em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:10px 6px 4px}
.pz-channel{display:flex;align-items:center;gap:6px;width:100%;border:none;background:transparent;text-align:left;padding:7px 8px;border-radius:5px;color:var(--vx-muted)}
.pz-channel:hover{background:var(--vx-surface-2);color:var(--vx-text)}
.pz-channel.active{background:hsla(213,40%,18%,.55);color:var(--vx-text);box-shadow:inset 2px 0 hsl(213 55% 42%)}
.pz-channel-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pz-channel-edit{margin-left:auto;opacity:0}
.pz-channel:hover .pz-channel-edit,.pz-channel.active .pz-channel-edit{opacity:.7}
.pz-channel-add{margin-top:6px;opacity:.75}
.pz-main{position:relative;display:flex;flex-direction:column;flex:1;min-width:0}
.pz-messages{flex:1;overflow-y:auto;padding:12px 14px 4px;display:flex;flex-direction:column}
.pz-older{align-self:center;margin:4px 0 8px;font-size:.8em;color:var(--vx-muted);background:none;border:none}
.pz-empty{margin:auto;color:var(--vx-muted)}
.pz-msg{position:relative;display:flex;gap:12px;padding:2px 8px;margin:0 -8px;border-radius:5px}
.pz-msg:hover{background:color-mix(in srgb,var(--vx-surface-2) 70%,transparent)}
.pz-msg.first{margin-top:10px}
.pz-msg.mentioned{background:color-mix(in srgb,var(--vx-accent) 12%,transparent);box-shadow:inset 2px 0 var(--vx-accent)}
.pz-avatar,.pz-avatar-spacer{width:34px;flex-shrink:0}
.pz-avatar{height:34px;border-radius:50%;object-fit:cover;background:var(--vx-surface-2)}
.pz-avatar-fallback{display:grid;place-items:center;background:hsl(207 70% 32%);font-weight:700}
.pz-msg-content{min-width:0;flex:1}
.pz-msg-head{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.pz-author{font-weight:700;background:none;border:none;padding:0}
.pz-author.has-color{color:#fff;text-shadow:0 0 5px var(--name),0 0 10px var(--name)}
.pz-crown{color:#fc3}
.pz-role{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--role) 45%,transparent);background:color-mix(in srgb,var(--role) 14%,transparent);font-size:.68em;font-weight:600}
.pz-time,.pz-edited{font-size:.75em;color:var(--vx-muted)}
.pz-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
.pz-text code{background:var(--vx-surface-2);padding:1px 4px;border-radius:4px}
.pz-text pre{background:var(--vx-surface-2);border:1px solid var(--vx-border);padding:8px;border-radius:5px;overflow-x:auto;margin:4px 0}
.pz-mention{color:var(--vx-accent);background:color-mix(in srgb,var(--vx-accent) 15%,transparent);border-radius:4px;padding:0 2px}
.pz-emote{height:1.6em;vertical-align:middle}
.pz-link{color:var(--vx-accent)}
.pz-reply-ref{font-size:.85em;color:var(--vx-muted);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-bottom:2px}
.pz-media{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.pz-media img{max-width:min(280px,100%);max-height:220px;border-radius:5px}
.pz-system{display:flex;gap:10px;margin:6px 0;padding:9px 12px;border:1px solid color-mix(in srgb,var(--vx-border) 80%,transparent);border-radius:5px;background:color-mix(in srgb,var(--vx-surface) 72%,transparent);font-size:.9em}
.pz-system.is-mod{border-color:color-mix(in srgb,var(--vx-danger) 40%,transparent);background:color-mix(in srgb,var(--vx-danger) 9%,transparent)}
.pz-system.is-announce{border-color:color-mix(in srgb,var(--vx-accent) 40%,transparent);background:color-mix(in srgb,var(--vx-accent) 12%,transparent)}
.pz-system-icon{color:var(--vx-muted);flex-shrink:0}
.pz-system.is-announce .pz-system-icon{color:var(--vx-accent)}
.pz-system.is-mod .pz-system-icon{color:var(--vx-danger)}
.pz-msg-actions{position:absolute;top:-10px;right:8px;display:none;gap:2px;background:hsla(220,42%,7%,.92);border:1px solid var(--vx-border);border-radius:5px;padding:2px;z-index:2}
.pz-msg:hover .pz-msg-actions{display:flex}
.pz-msg-actions button{border:none;background:transparent;color:var(--vx-muted);padding:3px;border-radius:5px;display:inline-flex}
.pz-msg-actions button:hover{color:var(--vx-text);background:var(--vx-surface-2)}
.pz-msg-actions .danger:hover{color:var(--vx-danger)}
.pz-edit-box{width:100%;background:var(--vx-surface-2);border:1px solid var(--vx-border);border-radius:5px;padding:6px 8px;resize:none}
.pz-typing{height:18px;padding:0 14px;font-size:.8em;color:var(--vx-muted);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pz-composer{position:relative;padding:0 12px 10px}
.pz-composer-row{display:flex;align-items:flex-end;gap:8px;background:hsla(216,30%,10%,.72);border:1px solid hsl(213 40% 30%);border-radius:20px;padding:6px 6px 6px 14px}
.pz-composer-row:focus-within{border-color:hsl(213 45% 42%)}
.pz-composer textarea{flex:1;border:none;outline:none;background:transparent;resize:none;max-height:140px;padding:6px 0;line-height:1.4}
.pz-composer textarea::placeholder{color:var(--vx-muted)}
.pz-send{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid hsl(213 45% 42%);border-radius:12px;background:hsl(213 55% 32%);color:#fff}
.pz-send:disabled{opacity:.45;cursor:not-allowed}
.pz-send:not(:disabled):hover{background:hsl(213 55% 36%)}
.pz-reply{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.85em;color:var(--vx-muted);padding:4px 8px}
.pz-error{position:absolute;left:12px;right:12px;bottom:calc(100% + 22px);z-index:4;margin:0;padding:7px 10px;border:1px solid color-mix(in srgb,var(--vx-danger) 45%,var(--vx-border));border-radius:5px;background:hsla(220,42%,7%,.92);color:var(--vx-danger);font-size:.85em}
.pz-muted{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--vx-danger) 40%,var(--vx-border));border-radius:5px;background:color-mix(in srgb,var(--vx-danger) 10%,var(--vx-surface));font-size:.9em}
.pz-menu-pop{position:absolute;left:12px;right:12px;bottom:calc(100% - 4px);z-index:5;max-height:240px;overflow-y:auto;padding:5px;background:hsla(220,42%,7%,.94);border:2px solid var(--vx-border);border-radius:5px}
.pz-menu-pop button{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:none;border-radius:5px;background:transparent;color:var(--vx-muted);text-align:left;font-size:.88em}
.pz-menu-pop button:hover,.pz-menu-pop button.active{background:var(--vx-surface-2);color:var(--vx-text)}
.pz-menu-pop img{width:22px;height:22px;border-radius:50%;object-fit:cover}
.pz-footer{display:flex;justify-content:center;gap:6px;padding:4px 8px 6px;font-size:.72em;color:var(--vx-muted)}
.pz-footer a,.pz-footer button{color:inherit;background:none;border:none;padding:0;text-decoration:underline}
.pz-gate{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:16px 20px;overflow:auto}
.pz-glow{position:absolute;left:42%;top:48%;width:min(520px,90%);height:260px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse at center,hsla(220,32%,6%,.5) 0%,hsla(220,30%,4%,.22) 50%,transparent 74%);pointer-events:none}
.pz-land{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:28px;width:auto;max-width:100%}
.pz-copy{display:flex;flex-direction:column;align-items:flex-start;gap:8px;flex:0 1 240px;min-width:0;text-align:left}
.pz-mark{width:44px;height:44px;border-radius:14px;object-fit:cover;border:1px solid hsl(213 40% 32%)}
.pz-kicker{margin:0;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:hsl(213 75% 68%)}
.pz-land h2{margin:0;color:#fff;font-size:1.85rem;font-weight:800;letter-spacing:-.03em;line-height:1}
.pz-land p{margin:0;max-width:240px;color:hsl(216 15% 72%);font-size:13px;line-height:1.4}
.pz-thread{display:flex;flex-direction:column;gap:10px;width:210px;flex:0 0 auto}
.pz-line{display:flex;align-items:flex-end;gap:8px;max-width:100%}
.pz-line.out{align-self:flex-end;flex-direction:row-reverse}
.pz-line img,.pz-dot{width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0}
.pz-dot{display:grid;place-items:center;background:hsl(213 55% 32%);border:1px solid hsl(213 45% 42%);color:#fff;font-size:10px;font-weight:700}
.pz-say{padding:7px 10px;border-radius:14px 14px 14px 5px;background:hsla(216,30%,10%,.72);border:1px solid hsl(213 40% 30%);color:hsl(216 18% 86%);font-size:12px;line-height:1.35;text-align:left}
.pz-line.out .pz-say{border-radius:14px 14px 5px 14px;background:hsla(213,36%,16%,.8);border-color:hsl(213 32% 28%);color:hsl(216 20% 90%)}
.pz-points{display:flex;flex-wrap:wrap;gap:4px 10px;margin:2px 0 0;padding:0;list-style:none;color:hsl(216 15% 62%);font-size:11px;font-weight:600}
.pz-points li{display:inline-flex;align-items:center;gap:6px}
.pz-points i{width:5px;height:5px;border-radius:50%;background:hsl(213 45% 42%)}
.pz-join{display:inline-flex;align-items:center;gap:8px;margin-top:2px;border:1px solid hsl(213 45% 42%);border-radius:12px;padding:8px 14px;font-weight:600;font-size:13px;color:#fff;background:hsl(213 55% 32%)}
.pz-join img{width:16px;height:16px;border-radius:4px}
.pz-join:hover{background:hsl(213 55% 36%)}
.pz-primary{display:inline-flex;align-items:center;gap:8px;border:1px solid hsl(213 45% 42%);border-radius:12px;padding:10px 18px;font-weight:600;color:#fff;background:hsl(213 55% 32%)}
.pz-primary img{width:20px;height:20px}
.pz-primary:hover{background:hsl(213 55% 36%)}
.pz-spinner{width:28px;height:28px;border-radius:50%;border:3px solid var(--vx-border);border-top-color:var(--vx-accent);animation:pz-spin .8s linear infinite}
@keyframes pz-spin{to{transform:rotate(360deg)}}
.pz-online{width:200px;flex-shrink:0;overflow-y:auto;padding:10px 8px;background:hsla(220,48%,4%,.58);border-left:1px solid var(--vx-border)}
.pz-online-head{display:flex;justify-content:space-between;margin:0 6px 8px;color:var(--vx-muted);font-size:.75em;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.pz-online-role{margin:10px 6px 4px;color:var(--vx-muted);font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.pz-online-user{display:flex;align-items:center;gap:8px;width:100%;padding:5px 6px;border:none;border-radius:5px;background:transparent;text-align:left;font-size:.88em}
.pz-online-user:hover{background:var(--vx-surface-2)}
.pz-online-avatar{position:relative;width:26px;height:26px;flex-shrink:0}
.pz-online-avatar img,.pz-online-avatar span{width:100%;height:100%;border-radius:50%;object-fit:cover}
.pz-online-avatar i{position:absolute;right:-2px;bottom:-2px;width:9px;height:9px;border-radius:50%;border:2px solid hsla(220,42%,6%,.95);background:#2bd66e}
.pz-online-user .pz-author{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pz-menu{position:absolute;top:56px;right:10px;z-index:12;min-width:220px;background:hsla(220,42%,7%,.94);border:2px solid var(--vx-border);border-radius:5px;padding:6px;box-shadow:0 8px 24px #00000073}
.pz-menu-user{display:flex;align-items:center;gap:10px;padding:6px 8px 10px;border-bottom:1px solid var(--vx-border);margin-bottom:4px}
.pz-menu-user img{width:36px;height:36px;border-radius:50%;object-fit:cover}
.pz-menu-sub{color:var(--vx-muted);font-size:.8em}
.pz-menu button{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:8px;border-radius:5px;text-align:left}
.pz-menu button:hover{background:var(--vx-surface-2)}
.pz-menu .is-danger,.pz-menu .is-danger svg{color:var(--vx-danger)}
.pz-shade{position:fixed;inset:0;z-index:8;border:none;background:transparent;padding:0}
.pz-popover{position:fixed;z-index:15;width:min(290px,calc(100vw - 16px));padding:14px;display:flex;flex-direction:column;gap:10px;background:hsla(220,42%,7%,.94);border:2px solid var(--vx-border);border-radius:5px;box-shadow:0 10px 28px #00000080}
.pz-profile-head{display:flex;align-items:center;gap:10px}
.pz-profile-avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid color-mix(in srgb,var(--vx-accent) 40%,var(--vx-border))}
.pz-profile-sub{margin-top:2px;color:var(--vx-muted);font-size:.8em}
.pz-badges,.pz-roles,.pz-profile-actions{display:flex;flex-wrap:wrap;gap:6px}
.pz-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:.75em;font-weight:600;background:var(--vx-surface-2);color:var(--vx-muted)}
.pz-badge.is-owner{color:#fc3;background:color-mix(in srgb,#ffcc33 14%,transparent)}
.pz-badge.is-warn{color:#ffb347}
.pz-badge.is-danger{color:var(--vx-danger)}
.pz-label{color:var(--vx-muted);font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.pz-profile-actions{padding-top:10px;border-top:1px solid var(--vx-border)}
.pz-profile-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:1;padding:6px 10px;border:1px solid var(--vx-border);border-radius:5px;background:var(--vx-surface-2);font-size:.85em}
.pz-profile-btn.is-danger{color:var(--vx-danger)}
.pz-role-add{max-width:130px;padding:1px 6px;border:1px dashed var(--vx-border);border-radius:999px;background:transparent;color:var(--vx-muted);font-size:.78em}
.pz-dialog{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.55)}
.pz-card{display:flex;flex-direction:column;gap:10px;width:min(360px,100%);max-height:100%;overflow-y:auto;padding:16px;background:hsla(220,42%,7%,.96);border:2px solid var(--vx-border);border-radius:5px}
.pz-card.wide{width:min(440px,100%)}
.pz-card h3{margin:0;font-size:1.05em}
.pz-hint,.pz-card label.pz-hint{margin:0;font-size:.78em;color:var(--vx-muted)}
.pz-quote{margin:0;padding:6px 10px;border-left:3px solid var(--vx-border);color:var(--vx-muted);font-size:.88em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.pz-reasons{display:flex;flex-wrap:wrap;gap:6px}
.pz-reasons label{padding:5px 10px;border:1px solid var(--vx-border);border-radius:999px;font-size:.85em;cursor:pointer}
.pz-reasons input{position:absolute;opacity:0}
.pz-reasons label.on{border-color:var(--vx-danger);color:var(--vx-danger);background:color-mix(in srgb,var(--vx-danger) 12%,transparent)}
.pz-card textarea,.pz-card select,.pz-card input[type=text]{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--vx-border);border-radius:5px;background:transparent;color:var(--vx-text)}
.pz-actions{display:flex;justify-content:flex-end;gap:8px}
.pz-secondary{padding:8px 14px;border:1px solid var(--vx-border);border-radius:5px;background:transparent}
.pz-danger{background:var(--vx-danger);box-shadow:none}
.pz-rules{display:flex;flex-direction:column;gap:8px;max-height:min(52vh,420px);margin:0;padding:0;overflow-y:auto;list-style:none;counter-reset:pz}
.pz-rules li{position:relative;padding:9px 12px 9px 40px;border:1px solid var(--vx-border);border-radius:5px;background:var(--vx-surface-2);counter-increment:pz}
.pz-rules li:before{content:counter(pz);position:absolute;top:9px;left:12px;width:20px;color:var(--vx-accent);font-weight:700;text-align:center}
.pz-rules li.is-vortex{border-color:color-mix(in srgb,var(--vx-accent) 45%,var(--vx-border));background:color-mix(in srgb,var(--vx-accent) 10%,var(--vx-surface-2))}
.pz-rules strong{display:block}
.pz-rules p{margin:3px 0 0;color:var(--vx-muted);font-size:.86em;white-space:pre-wrap}
.pz-audit{display:flex;flex-direction:column;max-height:min(55vh,440px);margin:0;padding:0;overflow-y:auto;list-style:none}
.pz-audit li{padding:9px 2px;border-bottom:1px solid var(--vx-border)}
.pz-audit small{color:var(--vx-muted)}
.pz-check{display:flex;gap:8px;align-items:flex-start;font-size:.85em;color:var(--vx-muted)}
@media(max-width:430px){.pz-land{flex-direction:column;align-items:flex-start;gap:16px}.pz-thread{width:min(280px,100%)}}
@media(max-width:520px){.pz-channels{display:none!important}.pz-account-name{display:none}.pz-channel-select{display:block!important}.pz-online{position:absolute;top:0;right:0;bottom:0;z-index:6;width:min(240px,80vw);box-shadow:-8px 0 24px #0006}}
`;

function clock(at: number) {
  try {
    return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function tone(kind: string) {
  if (kind === "partnerAnnounce") return "is-announce";
  if (["timeout", "ban", "unban", "untimeout", "purge"].includes(kind)) return "is-mod";
  return "";
}

function Face({ src, name, className }: { src?: string; name?: string; className: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (src && !broken) return <img src={src} alt="" className={className} onError={() => setBroken(true)} />;
  return <span className={`${className} pz-avatar-fallback`}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}

function Rich({ text, emotes, names, channels }: { text: string; emotes: Record<string, string>; names: Map<string, string>; channels: Channel[] }) {
  const blocks = text.split("```");
  return (
    <>
      {blocks.map((block, bi) => {
        if (bi % 2 === 1) {
          return (
            <pre key={bi}>
              <code>{block.replace(/^[a-z]*\n/, "")}</code>
            </pre>
          );
        }
        const parts = block.split(/(\*\*[^*\n]+\*\*|~~[^~\n]+~~|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|https?:\/\/\S+|:[a-zA-Z0-9_]{2,32}:|<@[a-zA-Z0-9]+>|<#[a-f0-9]{24}>)/g);
        return (
          <span key={bi}>
            {parts.map((part, i) => {
              if (!part) return null;
              if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
              if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) return <s key={i}>{part.slice(2, -2)}</s>;
              if (part.startsWith("__") && part.endsWith("__") && part.length > 4) return <u key={i}>{part.slice(2, -2)}</u>;
              if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
              if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
              if (part.startsWith("http")) return <span key={i} className="pz-link">{part}</span>;
              if (part.startsWith(":") && part.endsWith(":")) {
                const src = emotes[part.slice(1, -1)];
                if (!src) return <span key={i}>{part}</span>;
                return <img key={i} src={src} alt="" className="pz-emote" />;
              }
              if (part.startsWith("<@") && part.endsWith(">")) {
                return <span key={i} className="pz-mention">@{names.get(part.slice(2, -1)) || "member"}</span>;
              }
              if (part.startsWith("<#") && part.endsWith(">")) {
                const room = channels.find((c) => c.id === part.slice(2, -1));
                return <span key={i} className="pz-mention">#{room?.name || "room"}</span>;
              }
              return <span key={i}>{part}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

export default function ChatPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [channelId, setChannelId] = useState("");
  const [messages, setMessages] = useState<Note[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typing, setTyping] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<Note | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editText, setEditText] = useState("");
  const [gen, setGen] = useState(0);
  const [marks, setMarks] = useState<Record<string, RoleChip | null>>({});
  const [profileId, setProfileId] = useState("");
  const [profileAt, setProfileAt] = useState({ x: 16, y: 64 });
  const [profile, setProfile] = useState<Card | null>(null);
  const [onlineOpen, setOnlineOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commands, setCommands] = useState<Cmd[]>([]);
  const [mentions, setMentions] = useState<Person[]>([]);
  const [pick, setPick] = useState(0);
  const [reportMsg, setReportMsg] = useState<Note | null>(null);
  const [reportReason, setReportReason] = useState("spam");
  const [reportNote, setReportNote] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const [modUser, setModUser] = useState<{ id: string; username: string } | null>(null);
  const [modKind, setModKind] = useState("timeout");
  const [modMinutes, setModMinutes] = useState(60);
  const [modReason, setModReason] = useState("");
  const [modNotice, setModNotice] = useState(true);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditCursor, setAuditCursor] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [channelForm, setChannelForm] = useState<ChannelDraft | null>(null);
  const [discord, setDiscord] = useState<{ id: string; name: string; usable: boolean }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const revRef = useRef("0");
  const channelRef = useRef("");
  const liveRef = useRef(false);
  const typedAt = useRef(0);

  liveRef.current = !!boot?.viewer;

  useEffect(() => {
    let stop = false;
    fetch("/api/chat/boot", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Boot) => {
        if (stop || !data) return;
        setBoot(data);
        setChannelId(data.channelId || "");
        channelRef.current = data.channelId || "";
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setHasMore(!!data.hasMore);
        setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
        revRef.current = data.rev || "0";
        setNote(data.error || "");
        stickRef.current = true;
      })
      .catch(() => {
        if (!stop) setNote("Chat is unavailable right now.");
      });
    return () => {
      stop = true;
    };
  }, [gen]);

  useEffect(() => {
    const onStore = (e: StorageEvent) => {
      if (e.key === "pz-room-in" && !liveRef.current) setGen((n) => n + 1);
    };
    window.addEventListener("storage", onStore);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("pz-room");
      ch.onmessage = () => {
        if (!liveRef.current) setGen((n) => n + 1);
      };
    } catch {}
    return () => {
      window.removeEventListener("storage", onStore);
      ch?.close();
    };
  }, []);

  useEffect(() => {
    if (!boot?.viewer) return;
    try {
      localStorage.setItem("pz-room-in", String(Date.now()));
    } catch {}
    try {
      const ch = new BroadcastChannel("pz-room");
      ch.postMessage("in");
      ch.close();
    } catch {}
    fetch("/api/chat/commands", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.commands)) setCommands(data.commands);
      })
      .catch(() => {});
  }, [boot?.viewer?.id]);

  useEffect(() => {
    if (!boot?.viewer) return;
    const pullNotes = () => {
      fetch("/api/announcements/active", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (Array.isArray(data?.announcements)) setAnnouncements(data.announcements);
        })
        .catch(() => {});
    };
    const timer = window.setInterval(pullNotes, 20000);
    return () => window.clearInterval(timer);
  }, [boot?.viewer?.id]);

  useEffect(() => {
    if (!channelId || !boot?.viewer) return;
    let stop = false;
    const pull = async () => {
      const box = listRef.current;
      if (stop || document.hidden || !liveRef.current || !channelRef.current || !box) return;
      let node: HTMLElement | null = box;
      while (node) {
        if (getComputedStyle(node).display === "none") return;
        node = node.parentElement;
      }
      try {
        const q = new URLSearchParams({ channel: channelRef.current, v: revRef.current });
        const res = await fetch(`/api/chat/feed?${q}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (stop || data.channelId !== channelRef.current || data.unchanged) return;
        if (Array.isArray(data.messages)) {
          revRef.current = data.rev || revRef.current;
          setHasMore(!!data.hasMore);
          setMessages(data.messages);
        }
      } catch {}
    };
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [channelId, boot?.viewer?.id]);

  const authorKey = [...new Set(messages.map((m) => m.author?.id).filter(Boolean))].sort().slice(0, 40).join(",");

  useEffect(() => {
    if (!boot?.viewer || !authorKey) return;
    let stop = false;
    fetch(`/api/chat/marks?${new URLSearchParams({ ids: authorKey })}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!stop && data?.roles) setMarks(data.roles);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [boot?.viewer?.id, authorKey]);

  useEffect(() => {
    if (!profileId) return;
    let stop = false;
    setProfile(null);
    fetch(`/api/chat/member?${new URLSearchParams({ id: profileId })}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!stop && data?.id) setProfile(data);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [profileId]);

  useEffect(() => {
    if (!channelId || !boot?.viewer) return;
    let stop = false;
    const pull = () => {
      if (stop || document.hidden) return;
      fetch(`/api/chat/presence?${new URLSearchParams({ channel: channelId })}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (stop || !data) return;
          setGroups(Array.isArray(data.groups) ? data.groups : []);
          setOnlineCount(Number(data.count) || 0);
          setTyping(Array.isArray(data.typing) ? data.typing : []);
        })
        .catch(() => {});
    };
    pull();
    const timer = window.setInterval(pull, 12000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [channelId, boot?.viewer?.id]);

  useEffect(() => {
    const box = listRef.current;
    if (!box || !stickRef.current) return;
    box.scrollTop = box.scrollHeight;
  }, [messages, announcements]);

  useEffect(() => {
    const hit = draft.match(/(?:^|\s)@([a-zA-Z0-9_]{1,32})$/);
    if (!hit || !boot?.viewer) {
      setMentions([]);
      return;
    }
    const q = hit[1];
    const timer = window.setTimeout(() => {
      fetch(`/api/chat/mentions?${new URLSearchParams({ q })}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setMentions(Array.isArray(data?.users) ? data.users : []))
        .catch(() => {});
    }, 160);
    return () => window.clearTimeout(timer);
  }, [draft, boot?.viewer?.id]);

  const channel = boot?.channels.find((c) => c.id === channelId) || null;
  const names = new Map<string, string>();
  for (const msg of messages) {
    if (msg.author?.id && msg.author.username) names.set(msg.author.id, msg.author.username);
  }
  for (const group of groups) {
    for (const member of group.members || []) {
      if (member.id && member.username) names.set(member.id, member.username);
    }
  }
  const emotes = boot?.emotes || {};
  const held = !!(boot?.standing?.muted || boot?.standing?.timedOut);
  const canTalk = !!(boot?.viewer && channel?.canSend && boot.rules?.accepted !== false && !held);
  const showRules = !!(boot?.viewer && boot.rules && (boot.rules.accepted === false || rulesOpen));
  const cmdQuery = draft.startsWith("/") && !draft.includes(" ") ? draft.slice(1).toLowerCase() : "";
  const shownCmds = cmdQuery || draft === "/" ? commands.filter((c) => !cmdQuery || c.name.startsWith(cmdQuery)) : [];
  const mark = "/storage/images/vortex-petezah.webp";
  const logo = boot?.guild.icon && !boot.guild.icon.includes("843aa3394cd9e5d5") ? boot.guild.icon : mark;

  const choose = (id: string) => {
    if (id === channelId) return;
    setChannelId(id);
    channelRef.current = id;
    revRef.current = "0";
    stickRef.current = true;
    setReply(null);
    setEditing(null);
    setMessages([]);
    setGroups([]);
    fetch(`/api/chat/feed?${new URLSearchParams({ channel: id })}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.channelId !== id) return;
        revRef.current = data.rev || "0";
        setHasMore(!!data.hasMore);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      })
      .catch(() => {});
  };

  const older = async () => {
    const box = listRef.current;
    const first = messages[0];
    if (!box || !first || !channelId) return;
    const prev = box.scrollHeight;
    const res = await fetch(`/api/chat/history?${new URLSearchParams({ channel: channelId, before: first.id })}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const page: Note[] = Array.isArray(data.messages) ? data.messages : [];
    setHasMore(!!data.hasMore);
    setMessages((cur) => {
      const ids = new Set(cur.map((m) => m.id));
      return [...page.filter((m) => !ids.has(m.id)), ...cur];
    });
    stickRef.current = false;
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - prev;
    });
  };

  const pingType = () => {
    const now = Date.now();
    if (!channelId || now - typedAt.current < 3000) return;
    typedAt.current = now;
    fetch("/api/chat/typing", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    }).catch(() => {});
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = (editing ? editText : draft).trim();
    if (!content || !channelId || busy) return;
    setBusy(true);
    setNote("");
    try {
      const path = editing ? "/api/chat/edit" : "/api/chat/send";
      const body = editing ? { channelId, messageId: editing.id, content } : { channelId, content, replyTo: reply?.id || "" };
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(data.error || "That message could not be sent.");
        return;
      }
      setDraft("");
      setReply(null);
      setEditing(null);
      setMentions([]);
      stickRef.current = true;
      if (data.command) {
        setNote(data.command.text || (data.command.ok ? "Done." : "That command did not run."));
        revRef.current = "";
        return;
      }
      if (!editing && data.message?.id) {
        setMessages((cur) => (cur.some((m) => m.id === data.message.id) ? cur : [...cur, data.message]));
      }
      revRef.current = "";
    } catch {
      setNote("Chat is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (msg: Note) => {
    const res = await fetch("/api/chat/delete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, messageId: msg.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(data.error || "You cannot do that in this room.");
      return;
    }
    setMessages((cur) => cur.filter((m) => m.id !== msg.id));
    revRef.current = "";
  };

  const agree = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/chat/rules", { method: "POST", credentials: "include" });
      if (!res.ok) return;
      setBoot((cur) => (cur?.rules ? { ...cur, rules: { ...cur.rules, accepted: true } } : cur));
      setRulesOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    await fetch("/api/chat/logout", { method: "POST", credentials: "include" });
    setBoot((cur) => (cur ? { ...cur, viewer: null, rules: null, powers: null } : cur));
    setGroups([]);
    setMenuOpen(false);
  };

  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(data.error || "That action could not be done.");
        return false;
      }
      if (profileId) {
        const again = await fetch(`/api/chat/member?${new URLSearchParams({ id: profileId })}`, { credentials: "include" });
        if (again.ok) setProfile(await again.json());
      }
      return true;
    } catch {
      setNote("Chat is unavailable right now.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openJoin = () => {
    const tab = window.open("/api/chat/auth", "_blank");
    if (tab) tab.opener = null;
    else window.location.assign("/api/chat/auth");
  };

  const openProfile = (id: string, x: number, y: number) => {
    setMenuOpen(false);
    setProfileAt({ x: Math.min(x, window.innerWidth - 300), y: Math.min(y, window.innerHeight - 40) });
    setProfileId(id);
  };

  const openChannelForm = (source?: Channel) => {
    setChannelForm({
      id: source?.id || "",
      name: source?.name || "",
      description: source?.description || "",
      category: source?.category || "",
      slowmodeSeconds: source?.slowmodeSeconds || 0,
      readOnly: !!source?.readOnly,
      discordChannelId: "",
    });
    fetch("/api/chat/discord", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setDiscord(Array.isArray(data?.channels) ? data.channels.filter((c: { usable: boolean }) => c.usable) : []))
      .catch(() => {});
  };

  const saveRoom = async (remove: boolean) => {
    if (!channelForm) return;
    const payload: Record<string, unknown> = { ...channelForm, remove };
    if (!discord.length) delete payload.discordChannelId;
    const ok = await act("/api/chat/channel", payload);
    if (!ok) return;
    setChannelForm(null);
    setGen((n) => n + 1);
  };

  const loadAudit = async (after = "") => {
    const q = new URLSearchParams();
    if (after) q.set("after", after);
    const res = await fetch(`/api/chat/audit?${q}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(data.error || "You cannot do that in this room.");
      setAudit(null);
      return;
    }
    setAudit((cur) => (after && cur ? [...cur, ...(data.entries || [])] : data.entries || []));
    setAuditCursor(data.cursor || "");
  };

  const sendReport = async () => {
    if (!reportMsg) return;
    const ok = await act("/api/chat/report", {
      channelId,
      messageId: reportMsg.id,
      reason: reportReason,
      note: reportNote,
    });
    if (ok) setReportDone(true);
  };

  const applyMod = async () => {
    if (!modUser) return;
    const path = modKind.startsWith("un") ? (modKind === "unban" ? "/api/chat/ban" : "/api/chat/timeout") : modKind === "ban" ? "/api/chat/ban" : "/api/chat/timeout";
    const ok = await act(path, {
      userId: modUser.id,
      minutes: modMinutes,
      reason: modReason,
      clear: modKind.startsWith("un"),
      channelId: modNotice ? channelId : "",
    });
    if (ok) setModUser(null);
  };

  const insertMention = (user: Person) => {
    setDraft((cur) => cur.replace(/(?:^|\s)@[a-zA-Z0-9_]*$/, (hit) => `${hit.startsWith(" ") || hit.startsWith("\n") ? hit[0] : ""}<@${user.id}> `));
    setMentions([]);
    names.set(user.id, user.username);
  };

  const buckets: { name: string; items: Channel[] }[] = [];
  for (const item of boot?.channels || []) {
    const name = item.category || "";
    const found = buckets.find((b) => b.name === name);
    if (found) found.items.push(item);
    else buckets.push({ name, items: [item] });
  }

  const typingLine = typing.length === 1 ? `${typing[0]} is typing…` : typing.length > 1 ? `${typing.slice(0, 2).join(" and ")} are typing…` : "";

  let body: ReactNode = (
    <div className="pz-gate">
      <div className="pz-spinner" />
    </div>
  );

  if (boot && !boot.viewer) {
    body = (
      <div className="pz-gate">
        <div className="pz-glow" aria-hidden="true" />
        <div className="pz-land">
          <div className="pz-copy">
            <img className="pz-mark" src={mark} alt="" />
            <p className="pz-kicker">PeteZah × Vortex</p>
            <h2>The room</h2>
            <p>Log in with your Vortex account and jump into the conversation.</p>
            {boot.join ? (
              <button type="button" className="pz-join" onClick={openJoin}>
                <img src={mark} alt="" />
                Log in with Vortex
              </button>
            ) : (
              <button type="button" className="pz-join" onClick={() => onNavigate("petezah://account")}>
                Sign in
              </button>
            )}
            <ul className="pz-points">
              <li><i />Channels</li>
              <li><i />Roles</li>
              <li><i />Announcements</li>
            </ul>
          </div>
          <div className="pz-thread" aria-hidden="true">
            <div className="pz-line">
              <img src={mark} alt="" />
              <span className="pz-say">Anyone here?</span>
            </div>
            <div className="pz-line out">
              <span className="pz-dot">P</span>
              <span className="pz-say">On my way.</span>
            </div>
          </div>
        </div>
      </div>
    );
  } else if (boot?.viewer) {
    body = (
      <>
        <div
          className="pz-messages"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {hasMore ? (
            <button type="button" className="pz-older" onClick={older}>
              Load older
            </button>
          ) : null}
          {announcements.map((item) => (
            <div key={item.id} className="pz-system is-announce">
              <Shield size={16} className="pz-system-icon" />
              <div>
                <strong>{item.title}</strong>
                <div>{item.content}</div>
              </div>
            </div>
          ))}
          {!messages.length ? <div className="pz-empty">No messages yet. Say hi!</div> : null}
          {messages.map((msg, index) => {
            const prev = messages[index - 1];
            const first = !prev || prev.system || msg.system || prev.author?.id !== msg.author?.id || msg.at - prev.at > 7 * 60 * 1000;
            if (msg.system) {
              return (
                <div key={msg.id} className={`pz-system ${tone(msg.kind)}`}>
                  <Shield size={16} className="pz-system-icon" />
                  <div className="pz-text">
                    <Rich text={msg.content} emotes={emotes} names={names} channels={boot.channels} />
                  </div>
                </div>
              );
            }
            const mine = msg.author?.id === boot.viewer?.id;
            const role = marks[msg.author?.id || ""] || null;
            const mentioned = boot.viewer?.id && msg.content.includes(`<@${boot.viewer.id}>`);
            const color = msg.author?.color || "";
            return (
              <article key={msg.id} className={`pz-msg${first ? " first" : ""}${mentioned ? " mentioned" : ""}`}>
                {first ? (
                  <button type="button" className="pz-icon-btn" onClick={(e) => msg.author?.id && openProfile(msg.author.id, e.clientX, e.clientY)}>
                    <Face src={msg.author?.avatar} name={msg.author?.username} className="pz-avatar" />
                  </button>
                ) : (
                  <span className="pz-avatar-spacer" />
                )}
                <div className="pz-msg-content">
                  {msg.reply ? <div className="pz-reply-ref">Replying to {msg.reply.author}: {msg.reply.content}</div> : null}
                  {first ? (
                    <div className="pz-msg-head">
                      <button type="button" className={`pz-author${color ? " has-color" : ""}`} style={color ? ({ ["--name" as string]: color } as CSSProperties) : undefined} onClick={(e) => msg.author?.id && openProfile(msg.author.id, e.clientX, e.clientY)}>
                        {msg.author?.username}
                      </button>
                      {msg.author?.id && msg.author.id === boot.guild.ownerId ? <Crown size={14} className="pz-crown" /> : null}
                      {role?.name ? (
                        <span className="pz-role" style={{ ["--role" as string]: role.color || "#0091ff" } as CSSProperties}>{role.name}</span>
                      ) : null}
                      {msg.author?.rank ? <span className="pz-time">{msg.author.rank}</span> : null}
                      <span className="pz-time">{clock(msg.at)}</span>
                    </div>
                  ) : null}
                  {editing?.id === msg.id ? (
                    <textarea className="pz-edit-box" value={editText} rows={2} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                      if (e.key === "Escape") setEditing(null);
                    }} />
                  ) : (
                    <div className="pz-text">
                      <Rich text={msg.content} emotes={emotes} names={names} channels={boot.channels} />
                      {msg.edited ? <span className="pz-edited"> (edited)</span> : null}
                    </div>
                  )}
                  {msg.images?.length || msg.gif ? (
                    <div className="pz-media">
                      {msg.images?.map((src) => <img key={src} src={src} alt="" />)}
                      {msg.gif ? <img src={msg.gif} alt="" /> : null}
                    </div>
                  ) : null}
                </div>
                <div className="pz-msg-actions">
                  <button type="button" title="Reply" onClick={() => { setReply(msg); setEditing(null); }}><Reply size={15} /></button>
                  {mine ? <button type="button" title="Edit" onClick={() => { setEditing(msg); setEditText(msg.content); setReply(null); }}><Pencil size={15} /></button> : null}
                  {mine || boot.powers?.messages ? <button type="button" className="danger" title="Delete" onClick={() => remove(msg)}><Trash2 size={15} /></button> : null}
                  {!mine ? <button type="button" title="Report" onClick={() => { setReportMsg(msg); setReportDone(false); setReportReason("spam"); setReportNote(""); }}><Flag size={15} /></button> : null}
                  {!mine && (boot.powers?.timeout || boot.powers?.ban) ? (
                    <button type="button" title="Moderate" onClick={() => { setModUser({ id: msg.author.id, username: msg.author.username }); setModKind(boot.powers?.timeout ? "timeout" : "ban"); }}>
                      <Shield size={15} />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <div className="pz-typing">{typingLine}</div>
        <form className="pz-composer" onSubmit={submit}>
          {note ? <p className="pz-error">{note}</p> : null}
          {shownCmds.length ? (
            <div className="pz-menu-pop">
              {shownCmds.slice(0, 8).map((cmd, i) => (
                <button key={cmd.name} type="button" className={i === pick ? "active" : ""} onClick={() => setDraft(`/${cmd.name} `)}>
                  <code>/{cmd.usage || cmd.name}</code>
                  <span>{cmd.description}</span>
                </button>
              ))}
            </div>
          ) : null}
          {mentions.length ? (
            <div className="pz-menu-pop">
              {mentions.map((user) => (
                <button key={user.id} type="button" onClick={() => insertMention(user)}>
                  <Face src={user.avatar} name={user.username} className="" />
                  <span className="pz-author" style={user.color ? { color: user.color } : undefined}>{user.username}</span>
                </button>
              ))}
            </div>
          ) : null}
          {reply ? (
            <div className="pz-reply">
              <span>Replying to {reply.author?.username}</span>
              <button type="button" className="pz-icon-btn" onClick={() => setReply(null)}><X size={14} /></button>
            </div>
          ) : null}
          {held ? (
            <div className="pz-muted">
              <VolumeX size={16} color="#ff4d4d" />
              <span>{boot.standing?.muted ? "You are muted on Vortex." : boot.standing?.until ? `Timed out until ${new Date(boot.standing.until).toLocaleString()}` : "You are timed out in this room."}</span>
            </div>
          ) : (
            <div className="pz-composer-row">
              <textarea
                rows={1}
                maxLength={2000}
                placeholder={`Message #${channel?.name || "room"}`}
                value={draft}
                disabled={!canTalk || busy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setPick(0);
                  pingType();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                  if (e.key === "Escape") {
                    setReply(null);
                    setMentions([]);
                  }
                }}
              />
              <button type="submit" className="pz-send" disabled={!canTalk || busy || !draft.trim()} title="Send">
                <Send size={16} />
              </button>
            </div>
          )}
        </form>
      </>
    );
  }

  return (
    <div className="pz-room no-obfuscate" data-no-obfuscate="true">
      <style>{roomCss}</style>
      {boot?.viewer ? <header className="pz-header">
        <img className="pz-logo" src={logo} alt="" />
        <div className="pz-header-text">
          <strong>{boot?.guild.name || "PeteZah"}</strong>
          <span>{boot?.viewer && channel ? `# ${channel.name}` : ""}</span>
        </div>
        {boot?.viewer ? (
          <select className="pz-channel-select" value={channelId} onChange={(e) => choose(e.target.value)}>
            {(boot.channels || []).map((item) => (
              <option key={item.id} value={item.id}>#{item.name}</option>
            ))}
          </select>
        ) : null}
        {boot?.viewer ? (
          <button type="button" className={`pz-online-btn${onlineOpen ? " active" : ""}`} onClick={() => setOnlineOpen((v) => !v)}>
            <Users size={16} />
            <span className="pz-online-count">{onlineCount}</span>
          </button>
        ) : null}
        {boot?.viewer ? (
          <button type="button" className="pz-account-btn" onClick={() => setMenuOpen((v) => !v)}>
            <Face src={boot.viewer.avatar} name={boot.viewer.username} className="" />
            <span className="pz-account-name">{boot.viewer.username}</span>
            <ChevronDown size={14} />
          </button>
        ) : null}
      </header> : null}
      <div className="pz-body">
        {boot?.viewer ? (
          <nav className="pz-channels" aria-label="Channels">
            {buckets.map((bucket) => (
              <div key={bucket.name || "channels"}>
                {bucket.name ? <div className="pz-cat">{bucket.name}</div> : null}
                {bucket.items.map((item) => (
                  <button key={item.id} type="button" className={`pz-channel${item.id === channelId ? " active" : ""}`} onClick={() => choose(item.id)}>
                    <Hash size={14} />
                    <span className="pz-channel-label">{item.name}</span>
                    {boot.powers?.channels && item.editable !== false ? (
                      <span className="pz-channel-edit" onClick={(e) => { e.stopPropagation(); openChannelForm(item); }}>
                        <Pencil size={12} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
            {boot.powers?.channels ? (
              <button type="button" className="pz-channel pz-channel-add" onClick={() => openChannelForm()}>
                <Plus size={14} />
                <span>New channel</span>
              </button>
            ) : null}
          </nav>
        ) : null}
        <main className="pz-main">{body}</main>
        {boot?.viewer && onlineOpen ? (
          <aside className="pz-online">
            <div className="pz-online-head">
              <span>Online</span>
              <span>{onlineCount}</span>
            </div>
            {!groups.length ? <div className="pz-online-role">Nobody else is here</div> : null}
            {groups.map((group) => (
              <div key={group.role?.name || "online"}>
                <div className="pz-online-role" style={group.role?.color ? { color: group.role.color } : undefined}>
                  {group.role?.name || "Online"} — {group.members?.length || 0}
                </div>
                {(group.members || []).map((member) => (
                  <button key={member.id || member.username} type="button" className="pz-online-user" onClick={(e) => member.id && openProfile(member.id, e.clientX, e.clientY)}>
                    <span className="pz-online-avatar">
                      <Face src={member.avatar} name={member.username} className="" />
                      <i />
                    </span>
                    <span className="pz-author" style={member.color ? { color: member.color } : undefined}>{member.username}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>
        ) : null}
      </div>
      {boot?.viewer ? (
      <footer className="pz-footer">
        <a href="https://vtx.chat" target="_blank" rel="noreferrer">Chat by Vortex</a>
        <span>·</span>
        <span>Not operated by Vortex</span>
        <span>·</span>
        <button type="button" onClick={() => window.open("/api/chat/report-room", "_blank", "noopener,width=460,height=700")}>Report</button>
      </footer>
      ) : null}
      {(menuOpen || profileId) && boot?.viewer ? <button type="button" className="pz-shade" aria-label="Close" onClick={() => { setMenuOpen(false); setProfileId(""); }} /> : null}
      {menuOpen && boot?.viewer ? (
        <div className="pz-menu">
          <div className="pz-menu-user">
            <Face src={boot.viewer.avatar} name={boot.viewer.username} className="" />
            <div>
              <div className="pz-author">{boot.viewer.username} {boot.viewer.owner ? <Crown size={12} className="pz-crown" /> : null}</div>
              <div className="pz-menu-sub">{boot.viewer.rank || boot.guild.name}</div>
            </div>
          </div>
          <button type="button" onClick={(e) => openProfile(boot.viewer!.id, e.clientX, e.clientY)}>Profile</button>
          {boot.rules ? <button type="button" onClick={() => { setMenuOpen(false); setRulesOpen(true); }}>Rules</button> : null}
          {boot.powers?.timeout || boot.powers?.ban || boot.powers?.roles ? <button type="button" onClick={() => { setMenuOpen(false); setAudit([]); loadAudit(); }}>Audit log</button> : null}
          <button type="button" onClick={() => window.open("/api/chat/report-room", "_blank", "noopener,width=460,height=700")}>Report</button>
          <button type="button" className="is-danger" onClick={leave}><LogOut size={15} /> Log out</button>
        </div>
      ) : null}
      {profileId ? (
        <div className="pz-popover" style={{ left: profileAt.x, top: profileAt.y }} onClick={(e) => e.stopPropagation()}>
          {!profile ? (
            <div className="pz-spinner" />
          ) : (
            <>
              <div className="pz-profile-head">
                <Face src={profile.avatar} name={profile.username} className="pz-profile-avatar" />
                <div>
                  <div className="pz-author" style={profile.color ? { color: profile.color } : undefined}>{profile.username}</div>
                  <div className="pz-profile-sub">{profile.rank || "Member"}{profile.joinedAt ? ` · Joined ${new Date(profile.joinedAt).toLocaleDateString()}` : ""}</div>
                </div>
                <button type="button" className="pz-icon-btn" onClick={() => setProfileId("")}><X size={14} /></button>
              </div>
              <div className="pz-badges">
                {profile.owner ? <span className="pz-badge is-owner"><Crown size={12} /> Guild owner</span> : null}
                {profile.staff ? <span className="pz-badge">Vortex staff</span> : null}
                {profile.timeoutUntil ? <span className="pz-badge is-warn">Timed out</span> : null}
                {profile.banned ? <span className="pz-badge is-danger">Banned</span> : null}
              </div>
              <div className="pz-label">Roles</div>
              <div className="pz-roles">
                {profile.roles?.map((role) => (
                  <span key={role.id || role.name} className="pz-role" style={{ ["--role" as string]: role.color || "#0091ff" } as CSSProperties}>
                    {role.name}
                    {boot?.powers?.roles && role.id && profile.id !== boot.viewer?.id ? (
                      <button type="button" className="pz-icon-btn" onClick={() => act("/api/chat/role", { userId: profile.id, roleId: role.id, on: false })}><X size={10} /></button>
                    ) : null}
                  </span>
                ))}
                {!profile.roles?.length ? <span className="pz-profile-sub">No roles</span> : null}
                {boot?.powers?.roles && profile.id !== boot.viewer?.id ? (
                  <select className="pz-role-add" value="" onChange={(e) => { if (e.target.value) act("/api/chat/role", { userId: profile.id, roleId: e.target.value, on: true }); }}>
                    <option value="">Add role</option>
                    {(boot.roles || []).filter((role) => role.id && !profile.roles?.some((r) => r.id === role.id)).map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                ) : null}
              </div>
              {profile.id !== boot?.viewer?.id && (boot?.powers?.timeout || boot?.powers?.ban) ? (
                <div className="pz-profile-actions">
                  {boot.powers?.timeout ? <button type="button" className="pz-profile-btn" onClick={() => { setModUser({ id: profile.id, username: profile.username }); setModKind("timeout"); }}>Timeout</button> : null}
                  {boot.powers?.ban ? <button type="button" className="pz-profile-btn is-danger" onClick={() => { setModUser({ id: profile.id, username: profile.username }); setModKind("ban"); }}>Ban</button> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {showRules && boot?.rules ? (
        <div className="pz-dialog">
          <div className="pz-card wide">
            <h3>Rules</h3>
            <p className="pz-hint">Read these before you start chatting.</p>
            <ol className="pz-rules">
              {boot.rules.items.map((rule, i) => (
                <li key={rule.title || i} className={rule.locked ? "is-vortex" : ""}>
                  <strong>{rule.title}</strong>
                  {rule.description ? <p>{rule.description}</p> : null}
                </li>
              ))}
            </ol>
            <div className="pz-actions">
              {boot.rules.accepted ? <button type="button" className="pz-secondary" onClick={() => setRulesOpen(false)}>Close</button> : null}
              {!boot.rules.accepted ? <button type="button" className="pz-primary" disabled={busy} onClick={agree}>I agree</button> : null}
            </div>
          </div>
        </div>
      ) : null}
      {reportMsg ? (
        <div className="pz-dialog" onClick={() => setReportMsg(null)}>
          <div className="pz-card" onClick={(e) => e.stopPropagation()}>
            {reportDone ? (
              <>
                <h3>Thanks for reporting</h3>
                <p className="pz-hint">Vortex staff will take a look.</p>
                <div className="pz-actions"><button type="button" className="pz-primary" onClick={() => setReportMsg(null)}>Close</button></div>
              </>
            ) : (
              <>
                <h3>Report message</h3>
                <p className="pz-quote">{reportMsg.content}</p>
                <div className="pz-reasons">
                  {REASONS.map(([id, label]) => (
                    <label key={id} className={reportReason === id ? "on" : ""}>
                      <input type="radio" name="reason" checked={reportReason === id} onChange={() => setReportReason(id)} />
                      {label}
                    </label>
                  ))}
                </div>
                <textarea rows={2} maxLength={500} placeholder="Add details (optional)" value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
                <p className="pz-hint">Vortex staff review reports. The person won't see who reported them.</p>
                <div className="pz-actions">
                  <button type="button" className="pz-secondary" onClick={() => setReportMsg(null)}>Cancel</button>
                  <button type="button" className="pz-primary pz-danger" disabled={busy} onClick={sendReport}>Report</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {modUser ? (
        <div className="pz-dialog" onClick={() => setModUser(null)}>
          <div className="pz-card" onClick={(e) => e.stopPropagation()}>
            <h3>Moderate</h3>
            <div className="pz-reasons">
              {boot?.powers?.timeout ? <label className={modKind === "timeout" ? "on" : ""}><input type="radio" checked={modKind === "timeout"} onChange={() => setModKind("timeout")} />Timeout</label> : null}
              {boot?.powers?.timeout ? <label className={modKind === "untimeout" ? "on" : ""}><input type="radio" checked={modKind === "untimeout"} onChange={() => setModKind("untimeout")} />Untimeout</label> : null}
              {boot?.powers?.ban ? <label className={modKind === "ban" ? "on" : ""}><input type="radio" checked={modKind === "ban"} onChange={() => setModKind("ban")} />Ban</label> : null}
              {boot?.powers?.ban ? <label className={modKind === "unban" ? "on" : ""}><input type="radio" checked={modKind === "unban"} onChange={() => setModKind("unban")} />Unban</label> : null}
            </div>
            {modKind === "timeout" || modKind === "ban" ? (
              <>
                <label className="pz-hint">For</label>
                <select value={modMinutes} onChange={(e) => setModMinutes(Number(e.target.value))}>
                  <option value={10}>10 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={1440}>1 day</option>
                  <option value={10080}>7 days</option>
                  {modKind === "ban" ? <option value={0}>Permanent</option> : null}
                </select>
              </>
            ) : null}
            <textarea rows={2} maxLength={200} placeholder="Reason (shown to them and in the audit log)" value={modReason} onChange={(e) => setModReason(e.target.value)} />
            <label className="pz-check">
              <input type="checkbox" checked={modNotice} onChange={(e) => setModNotice(e.target.checked)} />
              <span>Post a notice in this channel</span>
            </label>
            <div className="pz-actions">
              <button type="button" className="pz-secondary" onClick={() => setModUser(null)}>Cancel</button>
              <button type="button" className="pz-primary pz-danger" disabled={busy} onClick={applyMod}>Apply</button>
            </div>
          </div>
        </div>
      ) : null}
      {audit ? (
        <div className="pz-dialog" onClick={() => setAudit(null)}>
          <div className="pz-card wide" onClick={(e) => e.stopPropagation()}>
            <h3>Audit log</h3>
            <p className="pz-hint">Changes and moderation actions in this guild, newest first. Only moderators can see this.</p>
            <ul className="pz-audit">
              {!audit.length ? <li>Nothing here yet.</li> : null}
              {audit.map((entry) => (
                <li key={entry.id || `${entry.at}-${entry.message}`}>
                  <p>{entry.message || entry.action}</p>
                  <small>{entry.by ? `${entry.by} · ` : ""}{entry.at ? new Date(entry.at).toLocaleString() : ""}</small>
                </li>
              ))}
            </ul>
            <div className="pz-actions">
              {auditCursor ? <button type="button" className="pz-secondary" onClick={() => loadAudit(auditCursor)}>Load more</button> : null}
              <button type="button" className="pz-primary" onClick={() => setAudit(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {channelForm ? (
        <div className="pz-dialog" onClick={() => setChannelForm(null)}>
          <div className="pz-card" onClick={(e) => e.stopPropagation()}>
            <h3>{channelForm.id ? "Edit channel" : "New channel"}</h3>
            <label className="pz-hint">Name</label>
            <input type="text" maxLength={40} value={channelForm.name} onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })} />
            <label className="pz-hint">Description</label>
            <textarea rows={2} maxLength={140} value={channelForm.description} onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })} />
            <label className="pz-hint">Category</label>
            <input type="text" maxLength={40} value={channelForm.category} onChange={(e) => setChannelForm({ ...channelForm, category: e.target.value })} />
            <label className="pz-hint">Slowmode</label>
            <select value={channelForm.slowmodeSeconds} onChange={(e) => setChannelForm({ ...channelForm, slowmodeSeconds: Number(e.target.value) })}>
              <option value={0}>Off</option>
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={120}>2 minutes</option>
            </select>
            {discord.length ? (
              <>
                <label className="pz-hint">Linked Discord channel</label>
                <select value={channelForm.discordChannelId} onChange={(e) => setChannelForm({ ...channelForm, discordChannelId: e.target.value })}>
                  <option value="">None</option>
                  {discord.map((item) => <option key={item.id} value={item.id}>#{item.name}</option>)}
                </select>
              </>
            ) : null}
            <label className="pz-check">
              <input type="checkbox" checked={channelForm.readOnly} onChange={(e) => setChannelForm({ ...channelForm, readOnly: e.target.checked })} />
              <span>Read-only for everyone without a role that allows sending</span>
            </label>
            <div className="pz-actions">
              {channelForm.id ? <button type="button" className="pz-secondary" disabled={busy} onClick={() => saveRoom(true)}>Delete</button> : null}
              <button type="button" className="pz-secondary" onClick={() => setChannelForm(null)}>Cancel</button>
              <button type="button" className="pz-primary" disabled={busy || !channelForm.name.trim()} onClick={() => saveRoom(false)}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
