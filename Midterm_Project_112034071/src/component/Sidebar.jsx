import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase";
import { useAuth } from "../context/Authentication";
import { formatTime } from "../helper";
import NewRoomModal from "./Roomlist";
import ProfileModal from "./Profile";

export default function Sidebar({ activeRoom, onSelectRoom, onClose }) {
  const { user, userProfile } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "rooms"),
      where("members", "array-contains", user.uid),
      orderBy("lastMessageAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  const filtered = rooms.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (userProfile?.username || user?.email || "?")[0].toUpperCase();

  return (
    <>
      <div className="sidebar-header">
        <span>💬 Chatroom</span>
        <button className="icon-btn" onClick={() => setShowNewRoom(true)} title="New room" style={{ color: "var(--primary)" }}>
          ✏️
        </button>
      </div>

      {/* Search rooms */}
      <div className="search-bar">
        <input
          className="input"
          placeholder="🔍  Search rooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: 13 }}
        />
      </div>

      {/* Room list */}
      <div className="sidebar-list">
        {filtered.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No rooms yet.<br />
            <span style={{ color: "var(--primary)", cursor: "pointer", fontWeight: 600 }} onClick={() => setShowNewRoom(true)}>
              Create one!
            </span>
          </div>
        )}
        {filtered.map((room) => (
          <div
            key={room.id}
            className={`room-item ${activeRoom?.id === room.id ? "active" : ""}`}
            onClick={() => { onSelectRoom(room); onClose?.(); }}
          >
            <div className="avatar" style={{ background: "var(--primary-light)", color: "var(--primary)", fontSize: 16 }}>
              {room.isGroup ? "👥" : room.name[0]?.toUpperCase()}
            </div>
            <div className="room-info">
              <div className="room-name">{room.name}</div>
              <div className="room-preview">{room.lastMessage || "No messages yet"}</div>
            </div>
            {room.lastMessageAt && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                {formatTime(room.lastMessageAt)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div
          className="avatar"
          style={{ cursor: "pointer" }}
          onClick={() => setShowProfile(true)}
          title="Edit profile"
        >
          {userProfile?.photoURL
            ? <img src={userProfile.photoURL} alt="me" />
            : initials}
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
