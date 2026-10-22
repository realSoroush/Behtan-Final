import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./panel-modal.css";
const openDialogs = new Set<HTMLDialogElement>();
let originalOverflow = "";
export function PanelModal({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId(),
    close = useRef(onClose),
    working = useRef(busy);
  close.current = onClose;
  working.current = busy;
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    if (openDialogs.size === 0) originalOverflow = document.body.style.overflow;
    openDialogs.add(dialog);
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      openDialogs.delete(dialog);
      if (openDialogs.size === 0)
        document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="panel-modal"
      dir="rtl"
      aria-labelledby={heading}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!working.current) close.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !working.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <header className="panel-modal-head">
        <h2 id={heading}>{title}</h2>
        <button
          type="button"
          aria-label="بستن پنجره"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="panel-modal-body">{children}</div>
    </dialog>,
    document.querySelector(".pro-content") || document.body,
  );
}
