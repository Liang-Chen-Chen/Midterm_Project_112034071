import { useEffect, useRef } from "react";

export default function MessageContextMenu({ x, y, isOwn, onUnsend, onEdit, onReply, onClose }) {
  const ref = useRef();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Adjust position so menu doesn't go off-screen
  const style = {
    top: Math.min(y, window.innerHeight - 160),
    left: Math.min(x, window.innerWidth - 160),
  };

  return (
    <div className="context-menu" ref={ref} style={style}>
      <div className="context-menu-item" onClick={() => { onReply(); onClose(); }}>
        ↩️ Reply
      </div>
      {isOwn && (
        <>
          <div className="context-menu-item" onClick={() => { onEdit(); onClose(); }}>
            ✏️ Edit
          </div>
          <div className="context-menu-item danger" onClick={() => { onUnsend(); onClose(); }}>
            🗑️ Unsend
          </div>
        </>
      )}
    </div>
  );
}
