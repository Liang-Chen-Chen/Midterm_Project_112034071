import { useState } from "react";
import { updateDoc, doc, arrayRemove } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase";
import { useAuth } from "../context/Authentication";
import { formatTime } from "../helper";
import NewRoomModal from "./Roomlist";
import ProfileModal from "./Profile";

export default function Sidebar({ activeRoom, onSelectRoom, onClose, rooms = [], unreadCounts = {} }) {
  const { user, userProfile } = useAuth();
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [search, setSearch] = useState("");
  const [hoveredRoom, setHoveredRoom] = useState(null);

  const filtered = rooms.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (userProfile?.username || user?.email || "?")[0].toUpperCase();

  async function leaveRoom(e, room) {
    e.stopPropagation();
    if (!window.confirm(`Leave "${room.name}"?`)) return;
    await updateDoc(doc(db, "rooms", room.id), {
      members: arrayRemove(user.uid),
    });
    if (activeRoom?.id === room.id) onSelectRoom(null);
  }

  return (
    <>
      <div className="sidebar-header">
        <span>💬 Chatroom</span>
        <button className="icon-btn" onClick={() => setShowNewRoom(true)} title="New room" style={{ color: "var(--primary)" }}>
          ✏️
        </button>
      </div>

      <div className="search-bar">
        <input
          className="input"
          placeholder="🔍  Search rooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: 13 }}
        />
      </div>

      <div className="sidebar-list">
        {filtered.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No rooms yet.<br />
            <span style={{ color: "var(--primary)", cursor: "pointer", fontWeight: 600 }} onClick={() => setShowNewRoom(true)}>
              Create one!
            </span>
          </div>
        )}
        {filtered.map((room) => {
          const unread = unreadCounts[room.id] || 0;
          return (
            <div
              key={room.id}
              className={`room-item ${activeRoom?.id === room.id ? "active" : ""}`}
              onClick={() => { onSelectRoom(room); onClose?.(); }}
              onMouseEnter={() => setHoveredRoom(room.id)}
              onMouseLeave={() => setHoveredRoom(null)}
              style={{ position: "relative" }}
            >
              <div className="avatar" style={{ background: "var(--primary-light)", color: "var(--primary)", fontSize: 16 }}>
                {room.isGroup ? "👥" : room.name[0]?.toUpperCase()}
              </div>
              <div className="room-info">
                <div className="room-name" style={{ fontWeight: unread > 0 ? 800 : 600 }}>
                  {room.name}
                </div>
                <div className="room-preview" style={{
                  fontWeight: unread > 0 ? 600 : 400,
                  color: unread > 0 ? "var(--text)" : undefined
                }}>
                  {room.lastMessage || "No messages yet"}
                </div>
              </div>
              {hoveredRoom === room.id ? (
                <button
                  className="icon-btn"
                  style={{ width: 26, height: 26, color: "var(--danger)", flexShrink: 0 }}
                  onClick={(e) => leaveRoom(e, room)}
                  title="Leave room"
                >
                  🗑️
                </button>
              ) : unread > 0 ? (
                <div className="unread-badge">{unread > 99 ? "99+" : unread}</div>
              ) : (
                room.lastMessageAt && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                    {formatTime(room.lastMessageAt)}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="avatar" style={{ cursor: "pointer" }} onClick={() => setShowProfile(true)}>
          {userProfile?.photoURL ? <img src={userProfile.photoURL} alt="me" /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userProfile?.username || user?.email}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{user?.email}</div>
        </div>
        <button className="icon-btn" onClick={() => signOut(auth)} title="Sign out">🚪</button>
      </div>

      {showNewRoom && <NewRoomModal onClose={() => setShowNewRoom(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}