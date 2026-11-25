import React, { useMemo, useState } from 'react';
import { filterSupportConversations, openAdminSupportChat } from '../api/chat';

function supportTicketCustomer(conv) {
  const customer = conv.participants?.find((p) => p.role === 'customer');
  if (customer?.name) return customer.name;
  return conv.other_user?.name ?? 'Customer';
}

function formatTicketTime(sentAt) {
  if (!sentAt) return '';
  return new Date(sentAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminSupportPanel({
  open,
  conversations,
  onClose,
  onOpenChannel,
  onInboxReload,
}) {
  const [ticketId, setTicketId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const tickets = useMemo(
    () => filterSupportConversations(conversations),
    [conversations],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((conv) => {
      const id = String(conv.context_id ?? '');
      const name = supportTicketCustomer(conv).toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [tickets, search]);

  if (!open) return null;

  async function handleCreate(e) {
    e.preventDefault();
    const tid = ticketId.trim();
    const cid = Number(customerId.trim());
    if (!tid || !Number.isInteger(cid) || cid <= 0) {
      setError('Enter ticket ID and customer user ID.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await openAdminSupportChat(tid, cid, { navigate: false });
      setTicketId('');
      setCustomerId('');
      await onInboxReload?.();
      if (data?.channel_id) onOpenChannel?.(data.channel_id);
      onClose?.();
    } catch (err) {
      setError(
        err?.response?.data?.error ??
          err?.response?.data?.message ??
          err?.message ??
          'Could not open support chat.',
      );
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-surface border border-border"
        style={{
          borderRadius: 16,
          width: 'min(480px, 100%)',
          maxHeight: 'min(85vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px var(--color-shadow)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 20px 12px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <p
              className="text-text-primary"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 17,
                margin: 0,
              }}
            >
              Support tickets
            </p>
            <p
              className="text-text-secondary"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                margin: '4px 0 0',
              }}
            >
              {tickets.length} conversation{tickets.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-raised border border-border text-text-primary"
            style={{
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket # or customer…"
            className="border border-border bg-surface-raised text-text-primary"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
          {filtered.length === 0 ? (
            <p
              className="text-text-muted"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                textAlign: 'center',
                padding: 24,
              }}
            >
              {tickets.length === 0
                ? 'No support chats yet. Create one below.'
                : 'No tickets match your search.'}
            </p>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.channel_id}
                type="button"
                onClick={() => {
                  onOpenChannel?.(conv.channel_id);
                  onClose?.();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    className="text-text-primary"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 14,
                      margin: 0,
                    }}
                  >
                    Ticket #{conv.context_id}
                  </p>
                  <p
                    className="text-text-secondary"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      margin: '2px 0 0',
                    }}
                  >
                    {supportTicketCustomer(conv)}
                  </p>
                  {conv.last_message?.content ? (
                    <p
                      className="text-text-muted"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 12,
                        margin: '6px 0 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {conv.last_message.content}
                    </p>
                  ) : null}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <p
                    className="text-text-muted"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 10,
                      margin: 0,
                    }}
                  >
                    {formatTicketTime(conv.last_message?.sent_at)}
                  </p>
                  {(conv.unread_count ?? 0) > 0 ? (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 9,
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: '18px',
                        textAlign: 'center',
                      }}
                    >
                      {conv.unread_count}
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>

        <form
          onSubmit={handleCreate}
          // Was a flat black overlay to read as "recessed" against the panel — that only works
          // while the panel is dark. var(--color-bg) is a step darker/grayer than the panel in
          // both themes (dark: #0a0a0e vs #13151c surface; light: #f6f6f8 vs #ffffff surface),
          // so the recessed effect holds either way.
          className="bg-bg"
          style={{
            padding: 16,
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              margin: '0 0 10px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            New ticket chat
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="Ticket ID"
              className="border border-border bg-surface-raised text-text-primary"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Customer user ID"
              className="border border-border bg-surface-raised text-text-primary"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          {error ? (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 10,
              background: loading ? 'rgba(37,99,235,0.4)' : '#2563eb',
              border: 'none',
              color: '#fff',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Opening…' : 'Create & open chat'}
          </button>
        </form>
      </div>
    </div>
  );
}
