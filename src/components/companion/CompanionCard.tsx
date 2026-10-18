import { BehtanMascot } from './BehtanMascot';
import type { CompanionMessage } from './companionState';

interface Props {
  message: CompanionMessage;
  compact?: boolean;
  reactionKey?: string | number;
  onAction?: () => void;
}

export function CompanionCard({ message, compact = false, reactionKey, onAction }: Props) {
  return <aside aria-label="همراه به‌تن" className={`companion-card${compact ? ' companion-card--compact' : ''}`}>
    <BehtanMascot mood={message.mood} size={compact ? 'small' : 'medium'} reactionKey={reactionKey} />
    <div className="companion-card__content">
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className="companion-card__title">{message.title}</p>
        <p className="companion-card__body">{message.body}</p>
      </div>
      {message.action && onAction && <button type="button" className="companion-card__action" onClick={onAction}>{message.action}<span aria-hidden="true"> ←</span></button>}
    </div>
  </aside>;
}
