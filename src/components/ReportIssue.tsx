import { useState, type FormEvent } from 'react';
import { Bug, Check, ChevronRight, CreditCard, Send, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const categories = [
  { label: 'General Issue', Icon: TriangleAlert },
  // { label: 'Coins/Payment Issue', Icon: CreditCard },
  { label: 'Website Bug', Icon: Bug },
  { label: 'Something Not Working', Icon: Wrench },
];

interface ReportIssueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const reportScrollStyles = `
.report-issue-scroll { scrollbar-width: thin; scrollbar-color: #a39d97 transparent; }
.report-issue-scroll::-webkit-scrollbar { width: 8px; }
.report-issue-scroll::-webkit-scrollbar-track { background: transparent; }
.report-issue-scroll::-webkit-scrollbar-thumb { border-radius: 999px; background: #a39d97; }
`;

export function ReportIssue({ open, onOpenChange }: ReportIssueProps) {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Submission can be connected to the site's report service when one is available.
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <style>{reportScrollStyles}</style>
      <DialogContent
        overlayClassName="bg-black/45 backdrop-blur-[6px]"
        closeClassName="right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#f2f0ee] p-0 text-[#88827d] opacity-100 hover:bg-[#e9e5e1] [&>svg]:h-3 [&>svg]:w-3 sm:right-5 sm:top-4 sm:h-6 sm:w-6 sm:[&>svg]:h-4 sm:[&>svg]:w-4"
        className="fixed inset-x-0 bottom-4 left-1/2 top-auto grid h-[calc(100dvh-2rem)] max-h-[576px] w-[calc(100%-2rem)] max-w-[410px] -translate-x-1/2 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[28px] border-0 bg-[#fffdfa] p-0 text-[#282522] shadow-2xl dark:bg-[#fffdfa] dark:text-[#282522] data-[state=open]:animate-none data-[state=closed]:animate-none sm:bottom-auto sm:top-1/2 sm:h-[min(840px,calc(100dvh-3rem))] sm:max-h-[840px] sm:w-[min(600px,calc(100vw-2rem))] sm:max-w-[600px] sm:-translate-y-1/2 sm:rounded-[32px]"
      >
        <div>
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
            <span className="h-[3px] w-8 rounded-full bg-[#dedbd7] sm:hidden" />
          </div>
          <div className="flex items-center gap-2.5 border-b border-[#e8e1dc] px-4 pb-3 pt-3 sm:gap-3 sm:px-7 sm:py-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff0e8] text-[#f04d0a] sm:h-11 sm:w-11"><TriangleAlert size={17} className="sm:h-5 sm:w-5" /></span>
            <h2 className="text-sm font-semibold sm:text-xl">Report an Issue</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="report-issue-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-7 sm:py-6">
            <div className="space-y-3 sm:space-y-6">
            <fieldset>
              <legend className="mb-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#77716c] sm:mb-2.5 sm:text-xs">Category <span className="text-[#f04d0a]">*</span></legend>
              <div className="space-y-1.5 sm:space-y-2">
                {categories.map(({ label, Icon }) => (
                  <button key={label} type="button" onClick={() => setCategory(label)} aria-pressed={category === label}
                    className={`flex h-9 w-full items-center gap-2.5 rounded-full border px-3 text-left text-[13px] transition-colors sm:h-[56px] sm:gap-3.5 sm:px-5 sm:text-base ${category === label ? 'border-[#e5ddd7] bg-[#fceddf]' : 'border-[#e5ddd7] bg-[#fbf9f7] hover:bg-[#fff7f2]'}`}>
                    <Icon size={14} className="shrink-0 text-[#f04d0a] sm:h-5 sm:w-5" />
                    <span className="flex-1">{label}</span>
                    {category === label
                      ? <Check size={14} className="text-[#f04d0a]" />
                      : <ChevronRight size={14} className="text-[#aaa39d]" />}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#77716c] sm:text-xs" htmlFor="report-title">
              Title <span className="text-[#f04d0a]">*</span>
              <input id="report-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)}
                placeholder="Short title (e.g., Page not loading correctly)"
                className="mt-2 h-[39px] w-full rounded-full border border-[#e5ddd7] bg-[#fbf9f7] px-3 text-[13px] font-normal normal-case tracking-normal text-[#282522] outline-none placeholder:text-[#aaa39d] focus:border-[#ff9b63] focus:ring-2 focus:ring-[#ff9b63]/35 sm:mt-3 sm:h-12 sm:px-3 sm:text-base" />
            </label>

            <label className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#77716c] sm:text-xs" htmlFor="report-description">
              Description <span className="text-[#f04d0a]">*</span>
              <span className="relative mt-2 block">
                <textarea id="report-description" required maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the bug in detail. Include steps to reproduce, what you expected to happen, and what actually happened..."
                  className="h-[90px] w-full resize-none rounded-[20px] border border-[#e5ddd7] bg-[#fbf9f7] px-3 py-2.5 text-[13px] font-normal normal-case leading-[18px] tracking-normal text-[#282522] outline-none placeholder:text-[#aaa39d] focus:border-[#ff9b63] focus:ring-2 focus:ring-[#ff9b63]/35 sm:h-[148px] sm:rounded-[24px] sm:px-4 sm:py-3 sm:text-base sm:leading-[26px]" />
                <span className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] font-normal normal-case tracking-normal text-[#aaa39d] sm:bottom-4 sm:right-4 sm:text-xs">{description.length}/5000</span>
              </span>
            </label>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#e8e1dc] px-4 pb-3 pt-3 sm:px-7 sm:pb-5 sm:pt-5">
            <p className="mb-2.5 flex items-start gap-2 text-[10px] leading-[15px] text-[#77716c] sm:mb-3 sm:max-w-[500px] sm:gap-3 sm:text-sm sm:leading-5">
              <ShieldCheck size={14} className="mt-px shrink-0 text-[#938c86] sm:h-4 sm:w-4" />
              <span>Tell us what’s wrong and we’ll help fix it. Detailed reports may earn rewards.</span>
            </p>
            <button type="submit" className="flex h-[38px] w-full items-center justify-center gap-2 rounded-full bg-[#ee5708] px-4 text-[13px] font-semibold !text-white shadow-[0_10px_30px_-10px_rgba(234,88,12,0.65)] transition-colors hover:bg-[#df4f06] sm:h-[54px] sm:gap-2.5 sm:text-base">
              <Send size={15} className="shrink-0 !text-white sm:h-5 sm:w-5" />
              <span className="!text-white">Submit Report</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
