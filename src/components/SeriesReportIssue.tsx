import { useState, type FormEvent } from 'react';
import { BookOpen, Check, ChevronRight, Copyright, ImageOff, MessageSquareWarning, MoreHorizontal, Send, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const seriesReportStyles = `
html:has(.vortex-page.theme-dark) .series-report-dialog { border-color: #292522 !important; background: #141210 !important; color: #eee9e4 !important; }
html:has(.vortex-page.theme-dark) .series-report-header,
html:has(.vortex-page.theme-dark) .series-report-footer { border-color: #292522 !important; }
html:has(.vortex-page.theme-dark) .series-report-icon { background: color-mix(in srgb, var(--accent) 16%, #1c1917) !important; color: var(--accent) !important; }
html:has(.vortex-page.theme-dark) .series-report-close { background: #211e1b !important; color: #aaa29a !important; }
html:has(.vortex-page.theme-dark) .series-report-close:hover { background: #302a25 !important; color: #f4f4f5 !important; }
html:has(.vortex-page.theme-dark) .series-report-title,
html:has(.vortex-page.theme-dark) .series-report-category { color: #e8e3de !important; }
html:has(.vortex-page.theme-dark) .series-report-field-label { color: #aaa29a !important; }
html:has(.vortex-page.theme-dark) .series-report-category { border-color: #302b27 !important; background: #1c1a18 !important; }
html:has(.vortex-page.theme-dark) .series-report-category:hover { background: #25211e !important; }
html:has(.vortex-page.theme-dark) .series-report-category[aria-pressed="true"] { border-color: color-mix(in srgb, var(--accent) 52%, #302b27) !important; background: color-mix(in srgb, var(--accent) 14%, #1c1a18) !important; }
html:has(.vortex-page.theme-dark) .series-report-textarea { border-color: #302b27 !important; background: #1c1a18 !important; color: #eee9e4 !important; }
html:has(.vortex-page.theme-dark) .series-report-textarea::placeholder { color: #89817a !important; }
html:has(.vortex-page.theme-dark) .series-report-textarea:focus { border-color: var(--accent) !important; --tw-ring-color: color-mix(in srgb, var(--accent) 35%, transparent) !important; }
.series-report-submit { background: var(--accent-gradient) !important; box-shadow: 0 10px 30px -10px rgba(var(--accent-rgb), .65) !important; }
.series-report-submit:hover { background: var(--accent-gradient-hover) !important; }
`;

const issueTypes = [
  { label: 'Wrong chapter', Icon: BookOpen },
  { label: 'Poor image quality', Icon: ImageOff },
  { label: 'Inappropriate content', Icon: MessageSquareWarning },
  { label: 'Copyright issue', Icon: Copyright },
  { label: 'Other', Icon: MoreHorizontal },
];

interface SeriesReportIssueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesSlug: string;
  seriesTitle: string;
}

export function SeriesReportIssue({ open, onOpenChange, seriesSlug, seriesTitle }: SeriesReportIssueProps) {
  const [issueType, setIssueType] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIssueType('');
      setDetails('');
      setSubmitted(false);
      setSubmitError('');
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issueType || submitting || submitted) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/series-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesSlug, seriesTitle, issueType, details }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error || 'The report could not be submitted. Please try again later.');
      }
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The report could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <style>{seriesReportStyles}</style>
      <DialogContent
        overlayClassName="bg-black/55 backdrop-blur-[6px]"
        closeClassName="series-report-close right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#f2f0ee] p-0 text-[#88827d] opacity-100 hover:bg-[#e9e5e1] [&>svg]:h-3.5 [&>svg]:w-3.5 sm:right-5 sm:top-4 sm:h-7 sm:w-7"
        className="series-report-dialog fixed inset-x-0 bottom-4 left-1/2 top-auto grid h-[min(640px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[410px] -translate-x-1/2 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[28px] border border-[#e8e1dc] bg-[#fffdfa] p-0 text-[#282522] shadow-2xl data-[state=open]:animate-none data-[state=closed]:animate-none sm:bottom-auto sm:top-1/2 sm:h-[min(840px,84vh)] sm:max-h-[calc(100dvh-3rem)] sm:w-[min(600px,calc(100vw-2rem))] sm:max-w-[600px] sm:-translate-y-1/2 sm:rounded-[28px]"
      >
        <div>
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true"><span className="h-[3px] w-9 rounded-full bg-[#dedbd7]" /></div>
          <div className="series-report-header flex items-center gap-3 border-b border-[#e8e1dc] px-5 pb-4 pt-3 sm:px-7 sm:py-5">
            <span className="series-report-icon flex h-9 w-9 items-center justify-center rounded-full bg-[#fff0e8] text-[var(--accent)]"><ShieldCheck size={18} /></span>
            <DialogTitle className="series-report-title text-base font-semibold leading-none tracking-normal text-[#282522] sm:text-lg">Report an Issue</DialogTitle>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7 sm:py-6 sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
            <fieldset>
              <legend className="series-report-field-label mb-2.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#817a74] sm:text-xs">What’s the issue?</legend>
              <div className="grid gap-2">
                {issueTypes.map(({ label, Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setIssueType(label)}
                    aria-pressed={issueType === label}
                    className={`series-report-category flex min-h-[44px] w-full items-center gap-3 rounded-full border px-3.5 text-left text-[14px] transition-colors sm:min-h-[56px] sm:px-5 sm:text-base ${issueType === label ? 'border-[#f2a16d] bg-[#fff0e6]' : 'border-[#e8e1dc] bg-[#fbf9f7] hover:bg-[#fff7f2]'}`}
                  >
                    <Icon size={17} className="shrink-0 text-[var(--accent)]" />
                    <span className="flex-1">{label}</span>
                    {issueType === label ? <Check size={16} className="text-[var(--accent)]" /> : <ChevronRight size={16} className="text-[#aaa39d]" />}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="series-report-field-label mt-4 block text-[10px] font-bold uppercase tracking-[.08em] text-[#817a74] sm:mt-6 sm:text-xs" htmlFor="series-report-details">
              Additional details <span className="normal-case tracking-normal text-[#aaa39d]">(optional)</span>
              <span className="relative mt-2 block">
                <textarea
                  id="series-report-details"
                  maxLength={200}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Add any extra details..."
                  className="series-report-textarea h-[104px] w-full resize-none rounded-[22px] border border-[#e8e1dc] bg-[#fbf9f7] px-3.5 py-3 text-[14px] font-normal normal-case leading-5 tracking-normal text-[#282522] outline-none placeholder:text-[#aaa39d] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 sm:h-[148px] sm:px-4 sm:text-base"
                />
                <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] font-normal normal-case tracking-normal text-[#aaa39d]">{details.length}/200</span>
              </span>
            </label>
          </div>

          <div className="series-report-footer shrink-0 border-t border-[#e8e1dc] px-5 pb-4 pt-3 sm:px-7 sm:pb-5 sm:pt-5">
            <p className="mb-3 flex items-start gap-2 text-[11px] leading-[16px] text-[#817a74] sm:text-xs sm:leading-[18px]">
              <ShieldCheck size={15} className="mt-px shrink-0 text-[#938c86]" />
              <span role="status" aria-live="polite">{submitted ? 'Thanks! Your report was submitted.' : submitError || 'Thanks! Your report helps us keep the experience great.'}</span>
            </p>
            <button type="submit" disabled={!issueType || submitting || submitted} className="series-report-submit flex h-[38px] w-full items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold !text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:h-[54px] sm:gap-2.5 sm:text-base">
              <Send size={15} className="shrink-0 !text-white sm:h-5 sm:w-5" />
              <span>{submitting ? 'Submitting…' : submitted ? 'Report Submitted' : 'Submit Report'}</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
