import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Link, Phone, Share2, X } from 'lucide-react';

interface ShareableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Shareable({ open, onOpenChange }: ShareableProps) {
  const getShareContent = () => {
    const pageTitle = document.querySelector('main h1')?.textContent?.trim() || document.title || 'Clydee';
    const url = window.location.href;
    const text = pageTitle.toLocaleLowerCase() === 'clydee'
      ? 'Check out Clydee!'
      : `Check out ${pageTitle} on Clydee!`;
    return { pageTitle, text, url };
  };

  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Fall back for browsers or contexts that block the Clipboard API.
    }

    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Clipboard copy was blocked');
  };

  const openShareWindow = (url: string) => {
    const popup = window.open(url, '_blank');
    if (popup) {
      popup.opener = null;
      return true;
    }
    return false;
  };

  const shareOnFacebook = () => {
    const { url } = getShareContent();
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    if (!openShareWindow(shareUrl)) {
      toast({ description: 'Your browser blocked the Facebook share window.' });
      return;
    }
    onOpenChange(false);
  };

  const shareOnX = () => {
    const { text, url } = getShareContent();
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    if (!openShareWindow(shareUrl)) {
      toast({ description: 'Your browser blocked the X share window.' });
      return;
    }
    onOpenChange(false);
  };

  const shareOnWhatsApp = () => {
    const { text, url } = getShareContent();
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    if (!openShareWindow(shareUrl)) {
      toast({ description: 'Your browser blocked the WhatsApp share window.' });
      return;
    }
    onOpenChange(false);
  };

  const copyLink = async () => {
    const { url } = getShareContent();
    try {
      await copyText(url);
      toast({ description: 'Link copied to clipboard.' });
    } catch {
      toast({ description: 'Could not copy the link. Please copy it from your browser address bar.' });
    }
    onOpenChange(false);
  };

  const shareMoreOptions = async () => {
    const { pageTitle, text, url } = getShareContent();
    if (navigator.share) {
      try {
        await navigator.share({ title: pageTitle, text, url });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          onOpenChange(false);
          return;
        }
        try {
          await copyText(url);
          toast({ description: 'Sharing is unavailable here, so the link was copied instead.' });
        } catch {
          toast({ description: 'Sharing and copying are unavailable in this browser.' });
        }
      }
    } else {
      try {
        await copyText(url);
        toast({ description: 'This browser has no share menu, so the link was copied.' });
      } catch {
        toast({ description: 'Sharing and copying are unavailable in this browser.' });
      }
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
          <h2 className="text-sm font-semibold leading-5">Share Clydee</h2>
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
