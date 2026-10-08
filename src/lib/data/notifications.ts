import { db, apiFetch } from "./supabaseClient";

/** One row in the bell: an activity log entry or an admin announcement. */
export interface FeedItem {
  id: string;
  kind: "activity" | "announcement";
  title: string;
  body?: string;
  link?: string | null;
  createdAt: string;
}

export interface Feed {
  /** False until the notifications migration (0013) has been applied. */
  available: boolean;
  items: FeedItem[];
  unread: number;
}

const MISSING_TABLE = /does not exist|could not find the table|schema cache|PGRST205|42P01/i;

/** Activity + announcements, newest first, with the unread count since the user last opened the bell. */
export async function loadFeed(): Promise<Feed> {
  const client = db();
  const [{ data: notes, error: e1 }, { data: anns, error: e2 }, { data: userRes }] = await Promise.all([
    client.from("notifications").select("id, title, link, created_at").order("created_at", { ascending: false }).limit(40),
    client.from("announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(20),
    client.auth.getUser(),
  ]);
  const err = e1 ?? e2;
  if (err) {
    if (MISSING_TABLE.test(`${err.code ?? ""} ${err.message ?? ""}`)) return { available: false, items: [], unread: 0 };
    throw err;
  }
  const items: FeedItem[] = [
    ...(notes ?? []).map((n) => ({ id: `n-${n.id}`, kind: "activity" as const, title: n.title, link: n.link, createdAt: n.created_at })),
    ...(anns ?? []).map((a) => ({ id: `a-${a.id}`, kind: "announcement" as const, title: a.title, body: a.body, createdAt: a.created_at })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let lastSeen = "";
  const userId = userRes.user?.id;
  if (userId) {
    const { data: read } = await client.from("notification_reads").select("last_seen_at").eq("user_id", userId).maybeSingle();
    lastSeen = read?.last_seen_at ?? "";
  }
  const unread = items.filter((i) => !lastSeen || new Date(i.createdAt).getTime() > new Date(lastSeen).getTime()).length;
  return { available: true, items, unread };
}

/** Everything currently in the bell counts as seen. */
export async function markFeedSeen(): Promise<void> {
  const client = db();
  const { data } = await client.auth.getUser();
  if (!data.user) return;
  await client.from("notification_reads").upsert({ user_id: data.user.id, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/** Owner/support admins: post an announcement to every boutique. */
export async function postAnnouncement(title: string, body: string): Promise<{ id: string; recipients: number }> {
  return apiFetch("/api/admin/announcements", { method: "POST", body: JSON.stringify({ title, body }) });
}
