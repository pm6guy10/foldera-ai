import { redirect } from 'next/navigation';

// The briefing content is now shown directly on the dashboard.
export default function BriefingPage() {
  redirect('/dashboard');
}
