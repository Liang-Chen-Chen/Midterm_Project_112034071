import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, getDoc, arrayUnion, arrayRemove, getDocs, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../context/Authentication";
import { sanitize, formatTime } from "../helper";
import MessageContextMenu from "./Message";

// Available emojis for reactions
const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export default function ChatArea({ room, onToggleSidebar, onSearchOpen, searchOpen }) {
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [highlightedId, setHighlightedId] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]); // uids I blocked
  const [blockedByUsers, setBlockedByUsers] = useState([]); // uids who blocked me
  const bottomRef = useRef();
  const msgRefs = useRef({});
  const fileRef = useRef();
  const inputRef = useRef();

  // Load member profiles
  useEffect(() => {
    if (!room) return;
    room.members.forEach(async (uid) => {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setMemberProfiles((prev) => ({ ...prev, [uid]: snap.data() }));
      }
    });
  }, [room?.members?.join(",")]);

  // Load my blocked list and who blocked me
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setBlockedUsers(snap.data().blockedUsers || []);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!room || !user) return;
    // Check if any room member has blocked me
    const others = room.members.filter((m) => m !== user.uid);
    Promise.all(others.map((uid) => getDoc(doc(db, "users", uid)))).then((snaps) => {
      const blockers = snaps
        .filter((s) => s.exists() && (s.data().blockedUsers || []).includes(user.uid))
        .map((s) => s.id);
      setBlockedByUsers(blockers);
    });
  }, [room?.id, room?.members?.join(",")]);

  // Subscribe to messages
  useEffect(() => {
    if (!room) return;
    setMemberProfiles({});
    const q = query(collection(db, "rooms", room.id, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return unsub;
  }, [room?.id]);

  // Message search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      messages.filter((m) => !m.unsent && m.text?.toLowerCase().includes(q)).slice(0, 20)
    );
  }, [searchQuery, messages]);

  // Block / unblock a user
  async function toggleBlock(targetUid) {
    const isBlocked = blockedUsers.includes(targetUid);
    await updateDoc(doc(db, "users", user.uid), {
      blockedUsers: isBlocked ? arrayRemove(targetUid) : arrayUnion(targetUid),
    });
  }

  // Check if messaging is blocked in DM
  const isDMBlocked = !room?.isGroup && room?.members?.some((uid) => {
    if (uid === user.uid) return false;
    return blockedUsers.includes(uid) || blockedByUsers.includes(uid);
  });

  function scrollToMessage(id) {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId(null), 1500);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviteError("");
    setInviteLoading(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", inviteEmail.trim()));
      const snap = await getDocs(q);
      if (snap.empty) { setInviteError("No user found with that email."); return; }
      const found = snap.docs[0].data();
      if (room.members.includes(found.uid)) { setInviteError("Already a member."); return; }
      await updateDoc(doc(db, "rooms", room.id), {
        members: arrayUnion(found.uid),
        isGroup: true,
      });
      setInviteEmail("");
      setShowInvite(false);
    } finally {
      setInviteLoading(false);
    }
  }

  async function sendMessage() {
    if (isDMBlocked) return;
    const text = sanitize(input.trim());
    if (!text && !editingId) return;

    if (editingId) {
      await updateDoc(doc(db, "rooms", room.id, "messages", editingId), { text, edited: true });
      setEditingId(null);
      setInput("");
      return;
    }

    const msgData = {
      text,
      senderId: user.uid,
      senderName: userProfile?.username || user.email,
      senderPhoto: userProfile?.photoURL || "",
      createdAt: serverTimestamp(),
      unsent: false,
      edited: false,
      type: "text",
      reactions: {},
      ...(replyTo ? { replyTo } : {}),
    };

    await addDoc(collection(db, "rooms", room.id, "messages"), msgData);
    await updateDoc(doc(db, "rooms", room.id), {
      lastMessage: text.substring(0, 60),
      lastMessageAt: serverTimestamp(),
    });
    setInput("");
    setReplyTo(null);
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const storageRef = ref(storage, `chatImages/${room.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const msgData = {
        text: "",
        imageUrl: url,
        senderId: user.uid,
        senderName: userProfile?.username || user.email,
        senderPhoto: userProfile?.photoURL || "",
        createdAt: serverTimestamp(),
        unsent: false,
        type: "image",
        reactions: {},
      };
      await addDoc(collection(db, "rooms", room.id, "messages"), msgData);
      await updateDoc(doc(db, "rooms", room.id), {
        lastMessage: "📷 Image",
        lastMessageAt: serverTimestamp(),
      });
    } catch (err) {
      alert("Failed to upload image: " + err.message);
    }
    e.target.value = "";
  }

  async function unsendMessage(id) {
    await updateDoc(doc(db, "rooms", room.id, "messages", id), {
      unsent: true,
      text: "This message was unsent.",
      imageUrl: null,
    });
  }

  // Add or remove emoji reaction
  async function toggleReaction(msgId, emoji) {
    const msgRef = doc(db, "rooms", room.id, "messages", msgId);
    const msgSnap = await getDoc(msgRef);
    if (!msgSnap.exists()) return;
    const reactions = msgSnap.data().reactions || {};
    const users = reactions[emoji] || [];
    const hasReacted = users.includes(user.uid);
    await updateDoc(msgRef, {
      [`reactions.${emoji}`]: hasReacted ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
    setEmojiPickerMsgId(null);
  }

  function startEdit(msg) {
    setEditingId(msg.id);
    setInput(msg.text);
    inputRef.current?.focus();
  }

  function handleContextMenu(e, msg) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape") {
      setEditingId(null);
      setReplyTo(null);
      setInput("");
      setEmojiPickerMsgId(null);
    }
  }

  const senderName = useCallback(
    (senderId) => memberProfiles[senderId]?.username || memberProfiles[senderId]?.email || "...",
    [memberProfiles]
  );
  const senderPhoto = useCallback(
    (senderId) => memberProfiles[senderId]?.photoURL || "",
    [memberProfiles]
  );

  // Should this message be hidden? (blocked user in group)
  function isHidden(msg) {
    if (!room?.isGroup) return false;
    return blockedUsers.includes(msg.senderId) || blockedByUsers.includes(msg.senderId);
  }

  if (!room) {
    return (
      <div className="chat-area">
        <div className="chat-header">
          <button className="hamburger" onClick={onToggleSidebar}>☰</button>
          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Chatroom</span>
          <div />
        </div>
        <div className="empty-state">
          <span className="icon">💬</span>
          <p>Select a room to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area" style={{ position: "relative" }}>
      {/* Header */}
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="hamburger" onClick={onToggleSidebar}>☰</button>
          <div className="avatar avatar-sm" style={{ background: "var(--primary)", color: "#fff", fontSize: 13 }}>
            {room.isGroup ? "👥" : room.name[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{room.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {room.members.length} member{room.members.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-btn" onClick={() => setShowInvite(true)} title="Invite member">➕</button>
          <button className="icon-btn" onClick={onSearchOpen} title="Search messages">🔍</button>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="modal animate-scaleIn">
            <div className="modal-header">
              <h2>Invite Member</h2>
              <button className="icon-btn" onClick={() => setShowInvite(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Email</label>
                <input
                  className="input"
                  placeholder="user@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  autoFocus
                />
              </div>
              {inviteError && <p style={{ color: "var(--danger)", fontSize: 13 }}>⚠️ {inviteError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInvite} disabled={inviteLoading}>
                {inviteLoading ? "Inviting..." : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Search */}
      {searchOpen && (
        <div className="search-overlay">
          <input
            className="input"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button className="icon-btn" onClick={() => { setSearchQuery(""); onSearchOpen(); }}>✕</button>
          {searchResults.length > 0 && (
            <div className="search-results" style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", zIndex: 100 }}>
              {searchResults.map((m) => (
                <div key={m.id} className="search-result-item" onClick={() => scrollToMessage(m.id)}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{senderName(m.senderId)}</span>
                  <span dangerouslySetInnerHTML={{
                    __html: m.text.replace(new RegExp(searchQuery, "gi"), (match) => `<mark>${match}</mark>`)
                  }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DM blocked warning */}
      {isDMBlocked && (
        <div style={{
          background: "#fff3cd", borderTop: "1px solid #ffc107",
          padding: "10px 20px", fontSize: 13, color: "#856404", textAlign: "center"
        }}>
          ⚠️ You can no longer send messages in this conversation.
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" onClick={() => setEmojiPickerMsgId(null)}>
        {messages.map((msg) => {
          if (isHidden(msg)) return null;

          const isOwn = msg.senderId === user.uid;
          const name = senderName(msg.senderId);
          const photo = senderPhoto(msg.senderId);
          const reactions = msg.reactions || {};
          const hasReactions = Object.entries(reactions).some(([, users]) => users.length > 0);

          return (
            <div
              key={msg.id}
              ref={(el) => (msgRefs.current[msg.id] = el)}
              className={`msg-group ${isOwn ? "own" : "other"}`}
              onContextMenu={(e) => !msg.unsent && handleContextMenu(e, msg)}
            >
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
                flexDirection: isOwn ? "row-reverse" : "row"
              }}>
                {/* Avatar */}
                {!isOwn && (
                  <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                    {photo ? <img src={photo} alt="" /> : name[0]?.toUpperCase()}
                  </div>
                )}

                {/* Message content column */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start", maxWidth: "100%" }}>
                  {!isOwn && <div className="msg-sender">{name}</div>}

                  {/* Reply preview — inside the content column, aligned correctly */}
                  {msg.replyTo && (
                    <div
                      className="reply-preview"
                      style={{ cursor: "pointer", marginBottom: 3, alignSelf: "stretch" }}
                      onClick={() => scrollToMessage(msg.replyTo.id)}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 11 }}>{msg.replyTo.senderName}</div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                          {msg.replyTo.text || "📷 Image"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bubble or image */}
                  {msg.type === "image" && !msg.unsent ? (
                    <img
                      className="msg-img animate-fadeIn"
                      src={msg.imageUrl}
                      alt="sent image"
                      onClick={() => window.open(msg.imageUrl, "_blank")}
                    />
                  ) : (
                    <div className={`msg-bubble ${msg.unsent ? "unsent" : ""} ${msg.edited && !msg.unsent ? "edited" : ""} ${highlightedId === msg.id ? "highlight" : ""}`}>
                      {msg.text}
                    </div>
                  )}

                  {/* Reactions display */}
                  {hasReactions && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                      {Object.entries(reactions).map(([emoji, users]) =>
                        users.length > 0 ? (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            style={{
                              background: users.includes(user.uid) ? "var(--primary-light)" : "var(--surface2)",
                              border: users.includes(user.uid) ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                              borderRadius: 99,
                              padding: "1px 7px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            {emoji} <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{users.length}</span>
                          </button>
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Emoji picker trigger */}
                  {!msg.unsent && (
                    <div style={{ position: "relative" }}>
                      <button
                        className="icon-btn"
                        style={{ width: 20, height: 20, fontSize: 12, opacity: 0.5 }}
                        onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id); }}
                      >
                        😊
                      </button>
                      {emojiPickerMsgId === msg.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            [isOwn ? "right" : "left"]: 0,
                            bottom: 24,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            boxShadow: "var(--shadow)",
                            display: "flex",
                            gap: 4,
                            padding: 6,
                            zIndex: 200,
                            animation: "scaleIn 0.15s ease both",
                          }}
                        >
                          {EMOJI_LIST.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              style={{
                                background: "none",
                                border: "none",
                                fontSize: 20,
                                cursor: "pointer",
                                padding: "2px 4px",
                                borderRadius: 4,
                                transition: "transform 0.1s",
                              }}
                              onMouseEnter={(e) => e.target.style.transform = "scale(1.3)"}
                              onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="msg-meta">{formatTime(msg.createdAt)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOwn={contextMenu.msg.senderId === user.uid}
          isBlocked={blockedUsers.includes(contextMenu.msg.senderId)}
          onUnsend={() => unsendMessage(contextMenu.msg.id)}
          onEdit={() => startEdit(contextMenu.msg)}
          onReply={() => setReplyTo({
            id: contextMenu.msg.id,
            text: contextMenu.msg.text,
            senderName: senderName(contextMenu.msg.senderId),
          })}
          onBlock={() => toggleBlock(contextMenu.msg.senderId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        {replyTo && (
          <div className="reply-preview">
            <div>
              <strong>Replying to {replyTo.senderName}:</strong> {replyTo.text?.substring(0, 60)}
            </div>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {editingId && (
          <div className="reply-preview">
            <span>✏️ Editing message</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => { setEditingId(null); setInput(""); }}>✕</button>
          </div>
        )}

        <div className="input-row">
          <input type="file" ref={fileRef} accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          <button className="icon-btn" onClick={() => fileRef.current.click()} title="Send image">📎</button>
          <textarea
            ref={inputRef}
            className="msg-input"
            placeholder={isDMBlocked ? "You cannot send messages here." : editingId ? "Edit your message..." : "Type a message... (Enter to send)"}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDMBlocked}
          />
          <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || isDMBlocked}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}