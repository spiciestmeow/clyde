import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Link, Phone, Share, Share2, X } from 'lucide-react';

interface ShareableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Shareable({ open, onOpenChange }: ShareableProps) {
  const shareOnFacebook = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    onOpenChange(false);
  };

  const shareOnX = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=Vortex%20Scans`, '_blank');
    onOpenChange(false);
  };

  const shareOnWhatsApp = () => {
    const text = encodeURIComponent('Vortex Scans');
    const url = encodeURIComponent(window.location.href);
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
    onOpenChange(false);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    onOpenChange(false);
  };

  const shareMoreOptions = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Vortex Scans',
        url: window.location.href,
      }).catch(() => {});
    } else {
      void navigator.clipboard.writeText(window.location.href);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/45 backdrop-blur-[6px]"
        className="w-[calc(100%-2rem)] max-w-[256px] gap-0 overflow-hidden rounded-[20px] border-0 bg-[#f5f3f1] p-0 text-[#242220] shadow-2xl dark:bg-[#f5f3f1] dark:text-[#242220] data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <div className="flex flex-col gap-1 border-b border-[#dedbd7] px-[14px] py-[14px] pr-10">
          <h2 className="text-sm font-semibold leading-5">Share Vortex Scans</h2>
          <p className="text-xs leading-4 text-[#77716c]">Choose your platform</p>
        </div>
        <div className="px-2 py-2">
          <button
            onClick={shareOnFacebook}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1877f2] text-white">
              <Share2 className="h-5 w-5" />
            </div>
            <span className="text-sm font-normal">Share on Facebook</span>
          </button>
          <button
            onClick={shareOnX}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-white">
              <X className="h-5 w-5" />
            </div>
            <span className="text-sm font-normal">Share on X</span>
          </button>
          <button
            onClick={shareOnWhatsApp}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#19c96b] text-white">
              <Phone className="h-5 w-5" />
            </div>
            <span className="text-sm font-normal">Share on WhatsApp</span>
          </button>
          <button
            onClick={copyLink}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#292624]">
              <Link className="h-5 w-5" />
            </div>
            <span className="text-sm font-normal">Copy link</span>
          </button>
          <button
            onClick={shareMoreOptions}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#287cf5] text-white">
              <Share2 className="h-5 w-5" />
            </div>
            <span className="text-sm font-normal">More options</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
