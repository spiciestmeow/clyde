import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import './confirmation-dialog.css';

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen);
    }}>
      <DialogContent
        className="confirmation-dialog__content"
        overlayClassName="confirmation-dialog__overlay"
        closeClassName="confirmation-dialog__close"
        aria-describedby="confirmation-dialog-description"
      >
        <DialogHeader className="confirmation-dialog__header">
          <span className="confirmation-dialog__icon" aria-hidden="true">
            <AlertTriangle size={20} />
          </span>
          <div className="confirmation-dialog__copy">
            <DialogTitle className="confirmation-dialog__title">{title}</DialogTitle>
            <DialogDescription id="confirmation-dialog-description" className="confirmation-dialog__description">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogFooter className="confirmation-dialog__footer">
          <button
            type="button"
            className="confirmation-dialog__button confirmation-dialog__button--cancel"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirmation-dialog__button confirmation-dialog__button--confirm"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <LoaderCircle size={16} className="confirmation-dialog__spinner" /> : <Trash2 size={16} />}
            {pending ? 'Deleting…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
