import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";
import { AuthProvider, useAuth } from "./context/Authentication";
import AuthPage from "./pages/LoginPage";
import Sidebar from "./component/Sidebar";
import ChatArea from "./component/Chat";
import "./App.css";

function AppInner() {
  const { user } = useAuth();
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState(null); // separate ID to avoid stale closure
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({}); // { roomId: count }
  const [rooms, setRooms] = useState([]);
  const lastSeenRef = useRef({}); // { roomId: timestamp } — when user last viewed the room

  // Request Chrome notification permission on first login
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") showToast(" Notifications enabled!");
      });
    }
  }, [user]);

  // Subscribe to user's rooms
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "rooms"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const updated = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRooms(updated);
      // Sync activeRoom if it got updated (e.g. new member invited)
      setActiveRoom((prev) => {
        if (!prev) return prev;
        const refreshed = updated.find((r) => r.id === prev.id);
        return refreshed || prev;
      });
    });
    return unsub;
  }, [user]);

  // Track unread messages per room
  useEffect(() => {
    if (!user || rooms.length === 0) return;

    const unsubscribers = rooms.map((room) => {
      const q = query(
        collection(db, "rooms", room.id, "messages"),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      return onSnapshot(q, (snap) => {
        const lastSeen = lastSeenRef.current[room.id] || 0;

        // Count messages after lastSeen that aren't from me and aren't unsent
        const unread = snap.docs.filter((d) => {
          const data = d.data();
          if (data.senderId === user.uid) return false;
          if (data.unsent) return false;
          const ts = data.createdAt?.toMillis?.() || 0;
          return ts > lastSeen;
        });

        setUnreadCounts((prev) => ({ ...prev, [room.id]: unread.length }));

        // Chrome notification for new messages in non-active rooms
        snap.docChanges().forEach((change) => {
          if (change.type !== "added") return;
          const data = change.doc.data();
          if (data.senderId === user.uid) return;
          if (data.unsent) return;
          if (room.id === activeRoomId) return;
          if (change.doc.metadata.hasPendingWrites) return; 

          const ts = data.createdAt?.toMillis?.() ?? Date.now();
          if (ts < Date.now() - 15000) return; 

          if (Notification.permission === "granted") {
            new Notification(`💬 ${room.name}`, {
              body: data.text || "📷 Image",
              icon: "/favicon.svg",
            });
          }
        });
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [user, rooms, activeRoomId]);

  function handleSelectRoom(room) {
    if (!room) {
      setActiveRoom(null);
      setActiveRoomId(null);
      return;
    }
    setActiveRoom(room);
    setActiveRoomId(room.id);
    setSearchOpen(false);
    // Mark as read: record current timestamp
    lastSeenRef.current[room.id] = Date.now() + 1000;
    setUnreadCounts((prev) => ({ ...prev, [room.id]: 0 }));
  }

  function showToast(msg, duration = 3000) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }

  if (!user) return <AuthPage />;

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <Sidebar
          activeRoom={activeRoom}
          onSelectRoom={handleSelectRoom}
          onClose={() => setSidebarOpen(false)}
          rooms={rooms}  
          unreadCounts={unreadCounts}
        />
      </div>

      <ChatArea
        room={activeRoom}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onSearchOpen={() => setSearchOpen((v) => !v)}
        searchOpen={searchOpen}
      />

      {toast && <div className="toast animate-fadeIn">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}