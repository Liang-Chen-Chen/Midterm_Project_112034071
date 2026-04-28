import { useEffect, useRef } from "react";
import { Trash2, Edit2, Reply, UserX, UserCheck } from "lucide-react";

export default function MessageContextMenu({ x, y, isOwn, isBlocked, onUnsend, onEdit, onReply, onBlock, onClose }) {
  const ref = useRef();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const style = {
    top: Math.min(y, window.innerHeight - 200),
    left: Math.min(x, window.innerWidth - 180),
  };

  return (
    <div className="context-menu" ref={ref} style={style}>
      <div className="context-menu-item" onClick={() => { onReply(); onClose(); }}>
        <Reply size={16} /> Reply
      </div>
      {isOwn ? (
        <>
          <div className="context-menu-item" onClick={() => { onEdit(); onClose(); }}>
            <Edit2 size={16} /> Edit 
          </div>
          <div className="context-menu-item danger" onClick={() => { onUnsend(); onClose(); }}>
            <Trash2 size={15} /> Unsend
          </div>
        </>
      ) : (
        <div
          className="context-menu-item danger"
          onClick={() => { onBlock(); onClose(); }}
        >
          {isBlocked ? <UserCheck size={15} /> : <UserX size={15} />} {isBlocked ? " Unblock User" : " Block User"}
        </div>
      )}
    </div>
  );
}