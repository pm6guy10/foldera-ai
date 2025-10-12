// =====================================================
// FOLDERA MEETING PREP - NextAuth API Route
// Handles authentication with Google OAuth
// =====================================================

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

