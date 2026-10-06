"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Megaphone } from "./icons";
import { Dialog } from "@/components/ds/Dialog";
import { loadFeed, markFeedSeen, type Feed, type FeedItem } from "@/lib/data/notifications";

const POLL_MS = 60_000;

interface Ctx {
  feed: Feed | null;
  refresh: () => void;
  markSeen: () => void;
}
const NotificationsContext = React.createContext<Ctx | null>(null);

/** One shared feed for both bells (phone and desktop layouts render one each). */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [feed, setFeed] = React.useState<Feed | null>(null);
  const refresh = React.useCallback(() => {
    loadFeed()
      .then(setFeed)
      .catch(() => {
        // offline or a transient error: keep what we have, try again later
      });
  }, []);
  const markSeen = React.useCallback(() => {
    setFeed((f) => (f ? { ...f, unread: 0 } : f));
    void markFeedSeen().catch(() => {});
  }, []);

  React.useEffect(() => {
    refresh();
    const tick = () => document.visibilityState === "visible" && refresh();
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("boutiqo:notifications-changed", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("boutiqo:notifications-changed", refresh);
    };
  }, [refresh]);

  return <NotificationsContext.Provider value={{ feed, refresh, markSeen }}>{children}</NotificationsContext.Provider>;
}

/** Ask every bell on the page to reload (after posting an announcement, etc.). */
export function notifyFeedChanged() {
  window.dispatchEvent(new Event("boutiqo:notifications-changed"));
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && t.getDate() === now.getDate()) return `${hours} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (t.toDateString() === yesterday.toDateString()) return "Yesterday";
  return t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const ctx = React.useContext(NotificationsContext);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reading, setReading] = React.useState<FeedItem | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ctx?.feed?.available) return null;
  const { feed, markSeen } = ctx;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && feed.unread > 0) markSeen();
  }

  function openItem(item: FeedItem) {
    if (item.kind === "announcement") {
      setReading(item);
      setOpen(false);
      return;
    }
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  return (
    <div className="bq-notif" ref={wrapRef}>
      <button
        type="button"
        className="bq-back-btn bq-notif__btn"
        aria-label={feed.unread ? `Notifications, ${feed.unread} new` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={18} />
        {feed.unread > 0 ? <span className="bq-notif__badge">{feed.unread > 9 ? "9+" : feed.unread}</span> : null}
      </button>
      {open ? (
        <div className="bq-notif__panel" role="dialog" aria-label="Notifications">
          <div className="bq-notif__head">Notifications</div>
          {feed.items.length === 0 ? (
            <p className="bq-notif__empty">Nothing yet. Your activity and Boutiqo announcements show up here.</p>
          ) : (
            <ul className="bq-notif__list">
              {feed.items.map((item) => {
                const clickable = item.kind === "announcement" || !!item.link;
                return (
                  <li key={item.id}>
                    <button type="button" className="bq-notif__item" data-kind={item.kind} disabled={!clickable} onClick={() => openItem(item)}>
                      {item.kind === "announcement" ? (
                        <span className="bq-notif__icon" aria-hidden="true">
                          <Megaphone size={16} />
                        </span>
                      ) : (
                        <span className="bq-notif__dot" aria-hidden="true" />
                      )}
                      <span className="bq-notif__text">
                        {item.kind === "announcement" ? <span className="bq-notif__tag">Announcement</span> : null}
                        <span className="bq-notif__title">{item.title}</span>
                        <span className="bq-notif__time">
                          {relativeTime(item.createdAt)}
                          {item.kind === "announcement" ? " · tap to read" : item.link ? " · tap for details" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
      <Dialog open={!!reading} title={reading?.title} onClose={() => setReading(null)}>
        <p className="bq-notif__body">{reading?.body}</p>
        <p className="bq-notif__time" style={{ marginTop: 12 }}>
          From the Boutiqo team · {reading ? new Date(reading.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}
        </p>
      </Dialog>
    </div>
  );
}
