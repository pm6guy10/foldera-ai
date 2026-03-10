import { Users } from 'lucide-react';

export default function RelationshipsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Users className="w-10 h-10 text-zinc-700 mb-4" />
      <h2 className="text-zinc-200 font-semibold text-lg mb-2">Relationships</h2>
      <p className="text-zinc-500 text-sm max-w-xs">
        The engine will map key people and dynamics from your conversations once more signals are ingested.
      </p>
    </div>
  );
}
