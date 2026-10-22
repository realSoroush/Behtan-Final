import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { acquireMemberScrollLock } from '@/utils/memberDialogScroll';
export function MemberDialog({
  title,
  onClose,
  children,
  wide = false,
  variant = "sheet",
  dismissible = true,
  exiting = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: "sheet" | "confirmation";
  dismissible?: boolean;
  exiting?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const releaseScroll = acquireMemberScrollLock(document.body);
    try { node.showModal(); } catch (error) { releaseScroll(); throw error; }
    return () => {
      node.close();
      releaseScroll();
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const delay = matchMedia("(prefers-reduced-motion:reduce)").matches
      ? 0
      : 180;
    const id = setTimeout(() => closeRef.current(), delay);
    return () => clearTimeout(id);
  }, [closing]);
  return createPortal(
    <dialog
      ref={ref}
      className={`member-dialog ${wide ? "is-wide " : ""}${closing || exiting ? "is-closing" : ""} ${variant === "confirmation" ? "is-confirmation" : ""}`}
      aria-label={title}
      onClickCapture={closing ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
      onKeyDownCapture={closing ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if(dismissible)setClosing(true);
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            setClosing(true);
        }
      }}
    >
      <div className="member-dialog-heading">
        <h2>{title}</h2>
        <button
          type="button"
          disabled={!dismissible}
          autoFocus
          className="member-icon-button"
          aria-label="بستن"
          onClick={() => {if(dismissible)setClosing(true);}}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
