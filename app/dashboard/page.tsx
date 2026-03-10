import dynamic from 'next/dynamic';

// Client Shell Pattern - load dashboard client-side only
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
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-zinc-800 rounded" />
          <div className="h-4 w-32 bg-zinc-800 rounded" />
        </div>
        <div className="h-10 w-32 bg-zinc-800 rounded" />
      </div>
      
      {/* Metrics skeleton — matches 3-column layout in dashboard-content */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 sm:h-20 bg-zinc-900 rounded-xl border border-zinc-800" />
        ))}
      </div>
      
      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="col-span-1 lg:col-span-2 h-64 lg:h-96 bg-zinc-900 rounded-xl border border-zinc-800" />
        <div className="h-64 lg:h-96 bg-zinc-900 rounded-xl border border-zinc-800" />
      </div>
    </div>
  );
}

