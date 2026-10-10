import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Pencil, Plus, X } from "lucide-react";

type C = {
  surface: string;
  elevated: string;
  border: string;
  borderFocus: string;
  accent: string;
  accentDim: string;
  text: string;
  textSub: string;
  textMuted: string;
  danger: string;
  success: string;
};

type Grant = {
  id: string;
  ip: string;
  note: string;
  hint: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  cancelledAt: number | null;
};

const emptyForm = { ip: "", token: "", note: "", password: "" };

export function CustomAiPanel({ C }: { C: C }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState(emptyForm);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await fetch("/api/admin/ai-grants", { credentials: "include", headers: { Accept: "application/json" } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Could not load grants");
        return;
      }
      setGrants(Array.isArray(d.grants) ? d.grants : []);
    } catch {
      setErr("Could not load grants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createGrant(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await fetch("/api/admin/ai-grants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Could not save");
        return;
      }
      setForm(emptyForm);
      setOk("Assigned. This IP now uses that token.");
      await load();
    } catch {
      setErr("Could not save");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(g: Grant) {
    setEditing(g.id);
    setEdit({ ip: g.ip, token: "", note: g.note, password: "" });
    setErr("");
    setOk("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const body: Record<string, string | boolean> = {
        ip: edit.ip,
        note: edit.note,
        password: edit.password,
        active: true,
      };
      if (edit.token.trim()) body.token = edit.token.trim();
      const r = await fetch(`/api/admin/ai-grants/${editing}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Could not save");
        return;
      }
      setEditing(null);
      setEdit(emptyForm);
      setOk("Updated.");
      await load();
    } catch {
      setErr("Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, password: string, active: boolean) {
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const path = active ? `/api/admin/ai-grants/${id}` : `/api/admin/ai-grants/${id}/cancel`;
      const body = active ? { active: true, password } : { password };
      const r = await fetch(path, {
        method: active ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Could not update");
        return;
      }
      setEditing(null);
      setEdit(emptyForm);
      setOk(active ? "Restored." : "Cancelled. The IP is back on the site token.");
      await load();
    } catch {
      setErr("Could not update");
    } finally {
      setBusy(false);
    }
  }

  const field = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.elevated,
    color: C.text,
    fontSize: 12,
    outline: "none",
  };

  return (
    <div data-no-obfuscate className="no-obfuscate" style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}>
        <KeyRound size={14} style={{ color: C.accent }} />
        Custom AI
      </h2>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px", lineHeight: 1.45 }}>
        Assign a Groq token to one public IPv4 address. That address uses it for AI and never falls back to the site token. The token is encrypted and is not shown again.
      </p>

      <form onSubmit={createGrant} style={{ display: "grid", gap: 8, marginBottom: 16, padding: 12, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
        <input style={field} placeholder="Public IPv4" autoComplete="off" spellCheck={false} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} />
        <input style={field} placeholder="Groq token" type="password" autoComplete="new-password" spellCheck={false} value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        <input style={field} placeholder="Note (optional)" maxLength={80} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <input style={field} placeholder="Your password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit" disabled={busy} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.borderFocus}`, background: C.accentDim, color: C.text, fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Assign
        </button>
      </form>

      {err ? <p style={{ fontSize: 12, color: C.danger, margin: "0 0 10px" }}>{err}</p> : null}
      {ok ? <p style={{ fontSize: 12, color: C.success, margin: "0 0 10px" }}>{ok}</p> : null}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
        </div>
      ) : grants.length === 0 ? (
        <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>No grants yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {grants.map((g) => (
            <div key={g.id} style={{ padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: C.text, fontFamily: "ui-monospace, monospace" }}>{g.ip}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textSub }}>
                    {g.active ? "Active" : "Cancelled"} · token ••••{g.hint}
                    {g.note ? ` · ${g.note}` : ""}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                    {new Date(g.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button type="button" onClick={() => editing === g.id ? setEditing(null) : startEdit(g)} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 11, cursor: "pointer" }}>
                  {editing === g.id ? <X size={12} /> : <Pencil size={12} />}
                  {editing === g.id ? "Close" : "Edit"}
                </button>
              </div>
              {editing === g.id && (
                <form onSubmit={saveEdit} style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  <input style={field} value={edit.ip} autoComplete="off" spellCheck={false} onChange={(e) => setEdit({ ...edit, ip: e.target.value })} />
                  <input style={field} placeholder="New token (leave blank to keep)" type="password" autoComplete="new-password" spellCheck={false} value={edit.token} onChange={(e) => setEdit({ ...edit, token: e.target.value })} />
                  <input style={field} placeholder="Note" maxLength={80} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                  <input style={field} placeholder="Your password" type="password" autoComplete="current-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit" disabled={busy} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.borderFocus}`, background: C.accentDim, color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      Save
                    </button>
                    {g.active ? (
                      <button type="button" disabled={busy} onClick={() => setActive(g.id, edit.password, false)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        Cancel grant
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => setActive(g.id, edit.password, true)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.borderFocus}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        Restore
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
