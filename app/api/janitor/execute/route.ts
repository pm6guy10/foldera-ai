// =====================================================
// FOLDERA JANITOR - Execute Cleanup API
// Executes pending Drive cleanup actions
// =====================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { getGoogleAccessToken } from '@/lib/meeting-prep/auth';

// Lazy initialization to avoid build-time errors
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(url, key);
}

/**
 * POST /api/janitor/execute
 * Executes a pending Drive cleanup action
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    // Accept both actionId (user requirement) and action_id (backwards compat)
    const actionId = body.actionId || body.action_id;

    if (!actionId) {
      return NextResponse.json(
        { error: 'actionId is required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = getSupabaseClient();

    // Fetch the pending action
    const { data: action, error: fetchError } = await supabase
      .from('pending_actions')
      .select('*')
      .eq('id', action_id)
      .single();

    if (fetchError || !action) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      );
    }

    // Verify user owns this action
    const { data: user } = await supabase
      .from('meeting_prep_users')
      .select('id, email')
      .eq('email', session.user.email)
      .single();

    if (!user || user.id !== action.user_id) {
      return NextResponse.json(
        { error: 'Unauthorized - you do not own this action' },
        { status: 403 }
      );
    }

    // Check if already completed
    if (action.status === 'completed') {
      return NextResponse.json(
        { error: 'Action already completed' },
        { status: 400 }
      );
    }

    if (action.type !== 'drive_cleanup') {
      return NextResponse.json(
        { error: 'Invalid action type' },
        { status: 400 }
      );
    }

    // Initialize Google Drive API
    const accessToken = await getGoogleAccessToken(user.id);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Execute file moves
    const fileMoves = action.data?.file_moves || [];
    const results = {
      successful: [] as string[],
      failed: [] as Array<{ file: string; error: string }>,
    };

    // Helper function to find or create folder
    const getOrCreateFolder = async (folderPath: string): Promise<string | null> => {
      const parts = folderPath.split('/').filter(p => p.trim());
      let currentFolderId = 'root';

      for (const folderName of parts) {
        // Check if folder exists
        const searchResponse = await drive.files.list({
          q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
        });

        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
          currentFolderId = searchResponse.data.files[0].id!;
        } else {
          // Create folder
          const createResponse = await drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [currentFolderId],
            },
            fields: 'id',
          });
          currentFolderId = createResponse.data.id!;
        }
      }

      return currentFolderId;
    };

    // Execute each move
    for (const move of fileMoves) {
      try {
        let fileId: string | null = null;

        // If file_id is provided (from updated script), use it directly
        if (move.file_id) {
          // Verify the file exists and is in root
          try {
            const fileResponse = await drive.files.get({
              fileId: move.file_id,
              fields: 'id, name, parents',
            });

            // Check if file is in root (parents should include root)
            if (fileResponse.data.parents?.includes('root')) {
              fileId = move.file_id;
            } else {
              // File exists but not in root anymore (maybe already moved?)
              results.failed.push({
                file: move.file,
                error: 'File no longer in root directory (may have been moved)',
              });
              continue;
            }
          } catch (fileError: any) {
            // File ID invalid, fall back to name search
            console.warn(`[Janitor] File ID ${move.file_id} not found, falling back to name search`);
          }
        }

        // Fallback: Find the file by name in root (for backwards compatibility)
        if (!fileId) {
          const searchResponse = await drive.files.list({
            q: `name='${move.file}' and 'root' in parents and trashed=false`,
            fields: 'files(id, name)',
          });

          if (!searchResponse.data.files || searchResponse.data.files.length === 0) {
            results.failed.push({
              file: move.file,
              error: 'File not found in root directory',
            });
            continue;
          }

          fileId = searchResponse.data.files[0].id!;
        }

        // Get or create target folder
        const targetFolderId = await getOrCreateFolder(move.move_to);
        
        if (!targetFolderId) {
          results.failed.push({
            file: move.file,
            error: 'Failed to create target folder',
          });
          continue;
        }

        // Move the file
        await drive.files.update({
          fileId: fileId,
          addParents: targetFolderId,
          removeParents: 'root',
          fields: 'id, name, parents',
        });

        results.successful.push(move.file);
      } catch (moveError: any) {
        console.error(`[Janitor] Error moving file ${move.file}:`, moveError);
        results.failed.push({
          file: move.file,
          error: moveError.message || 'Unknown error',
        });
      }
    }

    // Update action status
    const { error: updateError } = await supabase
      .from('pending_actions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', actionId);

    if (updateError) {
      console.error('[Janitor] Error updating action status:', updateError);
    }

    // Return result
    const allSuccessful = results.failed.length === 0;
    
    return NextResponse.json({
      success: allSuccessful,
      message: allSuccessful
        ? `Successfully organized ${results.successful.length} files!`
        : `Organized ${results.successful.length} files. ${results.failed.length} failed.`,
      results: {
        successful: results.successful,
        failed: results.failed,
      },
    });

  } catch (error: any) {
    console.error('[Janitor] Execution error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute cleanup' },
      { status: 500 }
    );
  }
}

