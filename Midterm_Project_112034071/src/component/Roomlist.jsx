import { useState } from "react";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { getDoc, doc, updateDoc, arrayRemove } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/Authentication";

export default function NewRoomModal({ onClose, existingRoom }) {
  const { user, userProfile } = useAuth();
  const [roomName, setRoomName] = useState(existingRoom?.name || "");
  const [emailInput, setEmailInput] = useState("");
  const [members, setMembers] = useState(
    existingRoom ? existingRoom.members.filter((m) => m !== user.uid) : []
  );
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchUser() {
    if (!emailInput.trim()) return;
    setError("");
    const q = query(collection(db, "users"), where("email", "==", emailInput.trim()));
    const snap = await getDocs(q);
    if (snap.empty) {
      setError("No user found with that email.");
      return;
    }
    const found = snap.docs[0].data();
        // 如果我已封鎖此人，提示是否解除
        const mySnap = await getDoc(doc(db, "users", user.uid));
        const myBlocked = mySnap.data()?.blockedUsers || [];
        if (myBlocked.includes(found.uid)) {
        if (window.confirm(`You have blocked ${found.username || found.email}. Unblock them?`)) {
            await updateDoc(doc(db, "users", user.uid), {
            blockedUsers: arrayRemove(found.uid),
            });
        }
        return;
    }
    if (found.uid === user.uid) { setError("That's you!"); return; }
    if (members.includes(found.uid)) { setError("Already added."); return; }
    setMembers((prev) => [...prev, found.uid]);
    setMemberProfiles((prev) => [...prev, found]);
    setEmailInput("");
  }

  async function handleCreate() {
    if (!roomName.trim()) { setError("Room name is required."); return; }
    setLoading(true);
    try {
      const allMembers = [user.uid, ...members];
      await addDoc(collection(db, "rooms"), {
        name: roomName.trim(),
        members: allMembers,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        isGroup: allMembers.length > 2,
        lastMessage: "",
        lastMessageAt: serverTimestamp(),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-scaleIn">
        <div className="modal-header">
          <h2>New Chatroom</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Room Name</label>
            <input
              className="input"
              placeholder="e.g. Study Group"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Invite Members (by email)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="user@email.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchUser()}
              />
              <button className="btn btn-secondary" onClick={searchUser}>Add</button>
            </div>
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>⚠️ {error}</p>}
          {memberProfiles.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Members to invite:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {memberProfiles.map((m) => (
                  <span key={m.uid} style={{
                    background: "var(--primary-light)", color: "var(--primary)",
                    borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 600
                  }}>
                    {m.username || m.email}
                    <span style={{ marginLeft: 6, cursor: "pointer" }} onClick={() => {
                      setMembers(members.filter((id) => id !== m.uid));
                      setMemberProfiles(memberProfiles.filter((p) => p.uid !== m.uid));
                    }}>✕</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
