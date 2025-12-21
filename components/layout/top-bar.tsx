'use client';

import { useState } from 'react';
import { cn } from '@/lib/design-system';
import { typography } from '@/lib/design-system/typography';
import { transitions } from '@/lib/design-system/animations';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { motion, AnimatePresence } from 'framer-motion';

export function TopBar() {
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="flex items-center justify-between h-16 px-6">
          {/* Search/Command */}
          <button
            onClick={() => setShowCommandPalette(true)}
            className={cn(
              'flex items-center gap-3 px-4 py-2 rounded-lg',
              'bg-zinc-900 border border-zinc-800',
              'text-zinc-500 text-sm',
              transitions.base,
              'hover:border-zinc-700 hover:text-zinc-300',
              'w-72'
            )}
          >
            <SearchIcon />
            <span>Search or command...</span>
            <kbd className="ml-auto text-xs bg-zinc-800 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
          
          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
              <StatusIndicator status="success" size="sm" />
              <span className="text-xs text-zinc-400">Shadow Mode Active</span>
            </div>
            
            {/* Notifications */}
            <button className={cn(
              'relative p-2 rounded-lg',
              transitions.colors,
              'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800'
            )}>
              <BellIcon />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Command Palette */}
      <CommandPalette 
        isOpen={showCommandPalette} 
        onClose={() => setShowCommandPalette(false)} 
      />
    </>
  );
}

function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl"
          >
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
                <SearchIcon className="text-zinc-500" />
                <input
                  type="text"
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent text-zinc-50 placeholder:text-zinc-500 outline-none"
                  autoFocus
                />
                <kbd className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">ESC</kbd>
              </div>
              
              {/* Commands */}
              <div className="p-2 max-h-80 overflow-auto">
                <p className={cn(typography.label, 'text-zinc-500 px-3 py-2')}>
                  Quick Actions
                </p>
                {[
                  { icon: '⚡', label: 'Generate Briefing', shortcut: '⌘B' },
                  { icon: '🔍', label: 'Run Shadow Scan', shortcut: '⌘S' },
                  { icon: '📊', label: 'View Relationships', shortcut: '⌘R' },
                  { icon: '⚙️', label: 'Settings', shortcut: '⌘,' },
                ].map((cmd) => (
                  <button
                    key={cmd.label}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                      'text-left text-zinc-300',
                      transitions.colors,
                      'hover:bg-zinc-800'
                    )}
                  >
                    <span className="text-lg">{cmd.icon}</span>
                    <span className="flex-1">{cmd.label}</span>
                    <kbd className="text-xs text-zinc-500">{cmd.shortcut}</kbd>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

