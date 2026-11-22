import { useRef, type ReactNode } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useModalFocus } from '../hooks/useModalFocus';
import { Sparkles, X } from './Icon';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const prettyDate = (
  value: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
  locale = 'en-GB',
) => new Date(`${value}T12:00:00`).toLocaleDateString(locale, options);

export const shortDate = (value: string, locale = 'en-GB') =>
  new Date(`${value}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

export function Button({ children, onClick, variant = 'ghost', className = '', title, type = 'button', disabled = false }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'ghost' | 'solid' | 'outline' | 'danger';
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={cx('ui-btn', `ui-btn-${variant}`, className)}>
      {children}
    </button>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-mark"><Sparkles size={19} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Modal({ title, eyebrow, onClose, children, className = '' }: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { l } = useLanguage();
  useModalFocus(modalRef, onClose);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cx('modal', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={l('Close modal', 'Tutup jendela')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Progress({ value, tone = 'lime' }: { value: number; tone?: 'lime' | 'blue' }) {
  return <div className="progress-track"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
