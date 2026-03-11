import { Radio } from 'lucide-react';

export default function SignalsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Radio className="w-10 h-10 text-zinc-700 mb-4" />
      <h2 className="text-zinc-200 font-semibold text-lg mb-2">Activity</h2>
      <p className="text-zinc-500 text-sm max-w-xs">
        Everything Foldera reads from your inbox and calendar appears here.
      </p>
    </div>
  );
}
