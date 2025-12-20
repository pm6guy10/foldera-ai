
import { Mail, MessageSquare, AlertTriangle, Calendar, CheckSquare, FileText, Layout } from 'lucide-react';

export const SignalIcon = ({ source, className = "w-4 h-4" }: { source: string; className?: string }) => {
  switch (source) {
    case 'gmail':
      return <Mail className={`${className} text-red-400`} />;
    case 'outlook':
      return <Mail className={`${className} text-blue-500`} />; // Blue mail icon for Outlook
    case 'slack':
      return <MessageSquare className={`${className} text-purple-400`} />;
    case 'linear':
      return <CheckSquare className={`${className} text-blue-400`} />;
    case 'notion':
      return <FileText className={`${className} text-gray-200`} />;
    case 'calendar':
      return <Calendar className={`${className} text-yellow-400`} />;
    default:
      return <Layout className={`${className} text-slate-400`} />;
  }
};

