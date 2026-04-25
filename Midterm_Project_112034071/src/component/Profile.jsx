import { useState, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../firebase";
import { useAuth } from "../context/Authentication";

export default function ProfileModal({ onClose }) {
  const { user, userProfile, setUserProfile } = useAuth();
  const [form, setForm] = useState({
    username: userProfile?.username || "",
    phone: userProfile?.phone || "",
    address: userProfile?.address || "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || "");
  const fileRef = useRef();

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setPhotoURL(url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const update = { ...form, photoURL, email: user.email };
      await updateDoc(doc(db, "users", user.uid), update);
      await updateProfile(auth.currentUser, {
        displayName: form.username,
        photoURL,
      });
      setUserProfile((prev) => ({ ...prev, ...update }));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const initials = (form.username || user?.email || "?")[0].toUpperCase();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-scaleIn">
        <div className="modal-header">
          <h2>My Profile</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Avatar */}
          <div className="profile-avatar-wrapper">
            <div className="avatar avatar-lg" style={{ cursor: "pointer" }} onClick={() => fileRef.current.click()}>
              {photoURL ? <img src={photoURL} alt="avatar" /> : initials}
            </div>
            <input type="file" ref={fileRef} accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
            <span className="avatar-edit-btn" onClick={() => fileRef.current.click()}>
              {uploading ? "Uploading..." : "Change Photo"}
            </span>
          </div>

          {/* Email (read-only) */}
          <div className="form-group">
            <label>Email</label>
            <input className="input" value={user?.email || ""} readOnly style={{ background: "var(--bg)", color: "var(--text-muted)" }} />
          </div>

          {/* Username */}
          <div className="form-group">
            <label>Username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Your display name"
            />
          </div>

          {/* Phone */}
          <div className="form-group">
            <label>Phone</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+886 900 000 000"
              type="tel"
            />
          </div>

          {/* Address */}
          <div className="form-group">
            <label>Address</label>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Your address"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
