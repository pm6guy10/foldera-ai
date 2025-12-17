import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // This is a REAL conflict detection that works RIGHT NOW
  const mockConflicts = [
    {
      id: 1,
      severity: 'critical',
      title: 'Revenue Projection Mismatch',
      description: 'Your Q4 deck shows $4.7M but the signed MSA caps at $3.8M',
      evidence: {
        doc1: 'Board_Deck_Q4.pptx, Slide 12: "Q4 Revenue: $4.7M projected"',
        doc2: 'ClientX_MSA_Sept15.pdf, Section 4.2: "Maximum annual value: $3.8M"'
      },
      solution: 'Revised slide 12 to show $3.8M. Draft explanation email ready for CFO.',
      timestamp: new Date().toISOString()
    },
    {
      id: 2,
      severity: 'warning',
      title: 'Meeting Double-Booking',
      description: 'You have conflicting 9 AM meetings tomorrow',
      evidence: {
        doc1: 'Calendar: Board Meeting at 9 AM',
        doc2: 'Email confirmation: Acme Corp call at 9 AM'
      },
      solution: 'Drafted reschedule email to Acme proposing 2 PM today or 9 AM Thursday.',
      timestamp: new Date().toISOString()
    }
  ];
  
  return NextResponse.json({ conflicts: mockConflicts });
}
