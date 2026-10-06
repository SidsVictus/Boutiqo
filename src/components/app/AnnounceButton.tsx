"use client";

import * as React from "react";
import { Button } from "@/components/ds/Button";
import { Dialog } from "@/components/ds/Dialog";
import { Input } from "@/components/ds/Input";
import { Megaphone } from "./icons";
import { postAnnouncement } from "@/lib/data/notifications";
import { ApiError } from "@/lib/data/store";
import { useToast } from "@/lib/session/ToastContext";
import { notifyFeedChanged } from "./Notifications";

const TITLE_MAX = 120;
const BODY_MAX = 4000;

/** Admin: post a heading + message to every boutique's notifications. */
export function AnnounceButton({ disabled }: { disabled?: boolean }) {
  const { flash } = useToast();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  function close() {
    if (sending) return;
    setOpen(false);
    setError(null);
  }

  async function send() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError("Add both a heading and a message.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await postAnnouncement(t, b);
      flash(`Announcement sent to ${res.recipients} boutique${res.recipients === 1 ? "" : "s"}.`, "success");
      setTitle("");
      setBody("");
      setOpen(false);
      notifyFeedChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the announcement. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" iconLeft={<Megaphone size={16} />} disabled={disabled} title={disabled ? "Your role cannot send announcements" : undefined} onClick={() => setOpen(true)}>
        Announce
      </Button>
      <Dialog
        open={open}
        title="New announcement"
        description="Every boutique sees the heading in their notifications, and the message when they open it."
        onClose={close}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button variant="accent" onClick={() => void send()} disabled={sending}>
              {sending ? "Sending…" : "Send to all boutiques"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Heading" required maxLength={TITLE_MAX} hint={`${title.length}/${TITLE_MAX}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Message" required multiline rows={6} maxLength={BODY_MAX} hint={`${body.length}/${BODY_MAX}`} value={body} onChange={(e) => setBody(e.target.value)} />
          {error ? (
            <p role="alert" className="bq-field__error">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
