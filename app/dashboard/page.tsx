import dynamic from 'next/dynamic';

const DashboardContent = dynamic(
  () => import('@/components/dashboard/dashboard-content'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  }
);

export default function DashboardPage() {
  return <DashboardContent />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Single card skeleton */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800">
          <div className="h-3 w-28 bg-zinc-800 rounded" />
        </div>
        <div className="p-5 space-y-3">
          <div className="h-3 w-16 bg-zinc-800 rounded" />
          <div className="h-6 bg-zinc-800 rounded w-full" />
          <div className="h-6 bg-zinc-800 rounded w-4/5" />
          <div className="h-4 bg-zinc-800 rounded w-3/4 mt-2" />
          <div className="flex gap-3 mt-4">
            <div className="h-12 bg-zinc-800 rounded flex-1" />
            <div className="h-12 bg-zinc-800 rounded flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
