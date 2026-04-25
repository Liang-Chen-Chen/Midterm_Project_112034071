import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../context/Authentication";
import { sanitize, formatTime } from "../helper";
import MessageContextMenu from "./Message";

export default function ChatArea({ room, onToggleSidebar, onSearchOpen, searchOpen }) {
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // { id, text, senderName }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, msg }
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [highlightedId, setHighlightedId] = useState(null);
  const bottomRef = useRef();
  const msgRefs = useRef({});
  const fileRef = useRef();
  const inputRef = useRef();

  // Load member profiles
  useEffect(() => {
    if (!room) return;
    room.members.forEach(async (uid) => {
      if (memberProfiles[uid]) return;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setMemberProfiles((prev) => ({ ...prev, [uid]: snap.data() }));
      }
    });
  }, [room]);

  // Subscribe to messages
  useEffect(() => {
    if (!room) return;
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

  function scrollToMessage(id) {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId(null), 1500);
    }
  }

  async function sendMessage() {
    const text = sanitize(input.trim());
    if (!text && !editingId) return;

    if (editingId) {
      await updateDoc(doc(db, "rooms", room.id, "messages", editingId), {
        text,
        edited: true,
      });
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
      ...(replyTo ? { replyTo } : {}),
    };

    await addDoc(collection(db, "rooms", room.id, "messages"), msgData);
    // Update room last message
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
    };
    await addDoc(collection(db, "rooms", room.id, "messages"), msgData);
    await updateDoc(doc(db, "rooms", room.id), {
      lastMessage: "📷 Image",
      lastMessageAt: serverTimestamp(),
    });
    e.target.value = "";
  }

  async function unsendMessage(id) {
    await updateDoc(doc(db, "rooms", room.id, "messages", id), {
      unsent: true,
      text: "This message was unsent.",
      imageUrl: null,
    });
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
    }
  }

  const senderName = useCallback(
    (senderId) => memberProfiles[senderId]?.username || memberProfiles[senderId]?.email || "Unknown",
    [memberProfiles]
  );
  const senderPhoto = useCallback(
    (senderId) => memberProfiles[senderId]?.photoURL || "",
    [memberProfiles]
  );

  if (!room) {
    return (
      <div className="chat-area">
        {/* Mobile header */}
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
        <button className="icon-btn" onClick={onSearchOpen} title="Search messages">🔍</button>
      </div>

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
                    __html: m.text.replace(
                      new RegExp(searchQuery, "gi"),
                      (match) => `<mark>${match}</mark>`
                    )
                  }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg) => {
          const isOwn = msg.senderId === user.uid;
          const name = senderName(msg.senderId);
          const photo = senderPhoto(msg.senderId);

          return (
            <div
              key={msg.id}
              ref={(el) => (msgRefs.current[msg.id] = el)}
              className={`msg-group ${isOwn ? "own" : "other"}`}
              onContextMenu={(e) => !msg.unsent && handleContextMenu(e, msg)}
            >
              {/* Reply preview */}
              {msg.replyTo && (
                <div
                  className="reply-preview"
                  style={{ cursor: "pointer", marginBottom: 2, maxWidth: "100%" }}
                  onClick={() => scrollToMessage(msg.replyTo.id)}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 11 }}>{msg.replyTo.senderName}</div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                      {msg.replyTo.text || "📷 Image"}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexDirection: isOwn ? "row-reverse" : "row" }}>
                {/* Avatar */}
                {!isOwn && (
                  <div className="avatar avatar-sm">
                    {photo ? <img src={photo} alt="" /> : name[0]?.toUpperCase()}
                  </div>
                )}

                <div>
                  {!isOwn && <div className="msg-sender">{name}</div>}

                  {msg.type === "image" && !msg.unsent ? (
                    <img
                      className="msg-img animate-fadeIn"
                      src={msg.imageUrl}
                      alt="sent image"
                      onClick={() => window.open(msg.imageUrl, "_blank")}
                    />
                  ) : (
                    <div
                      className={`msg-bubble ${msg.unsent ? "unsent" : ""} ${msg.edited && !msg.unsent ? "edited" : ""} ${highlightedId === msg.id ? "highlight" : ""}`}
                    >
                      {msg.text}
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
          onUnsend={() => unsendMessage(contextMenu.msg.id)}
          onEdit={() => startEdit(contextMenu.msg)}
          onReply={() => setReplyTo({
            id: contextMenu.msg.id,
            text: contextMenu.msg.text,
            senderName: senderName(contextMenu.msg.senderId),
          })}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        {/* Reply preview */}
        {replyTo && (
          <div className="reply-preview">
            <div>
              <strong>Replying to {replyTo.senderName}:</strong> {replyTo.text?.substring(0, 60)}
            </div>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {/* Edit indicator */}
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
            placeholder={editingId ? "Edit your message..." : "Type a message... (Enter to send)"}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" onClick={sendMessage} disabled={!input.trim() && !editingId}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
