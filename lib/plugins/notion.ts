
import { Client } from '@notionhq/client';

export class NotionSensor {
  private client: Client;

  constructor() {
    const apiKey = process.env.NOTION_API_KEY;
    if (!apiKey) {
      throw new Error('Missing NOTION_API_KEY environment variable.');
    }
    this.client = new Client({ auth: apiKey });
  }

  /**
   * Fetch pages modified in the last 7 days.
   */
  async fetchRecentPages(daysBack: number = 7) {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    const filterIso = date.toISOString(); // Notion expects ISO 8601

    try {
      const response = await this.client.search({
        filter: {
          value: 'page',
          property: 'object',
        },
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time',
        },
        page_size: 20, // Limit to top 20 most recent
      });

      // Filter locally for date because search filter is limited
      const recentPages = response.results.filter((page: any) => {
        return page.last_edited_time >= filterIso;
      });

      return recentPages;
    } catch (error) {
      console.error('Error fetching Notion pages:', error);
      return [];
    }
  }

  /**
   * Fetch blocks for a page and extract text and TODOs
   */
  async getPageContent(pageId: string) {
    try {
      const response = await this.client.blocks.children.list({
        block_id: pageId,
        page_size: 100,
      });

      let content = '';
      let todos: string[] = [];

      for (const block of response.results as any[]) {
        // Extract text from paragraph
        if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
          content += block.paragraph.rich_text.map((t: any) => t.plain_text).join('') + '\n';
        }
        
        // Extract headings
        if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
           const type = block.type as 'heading_1' | 'heading_2' | 'heading_3';
           if (block[type].rich_text.length > 0) {
             content += `[${type.toUpperCase()}] ` + block[type].rich_text.map((t: any) => t.plain_text).join('') + '\n';
           }
        }

        // Extract To-Do items
        if (block.type === 'to_do') {
          const text = block.to_do.rich_text.map((t: any) => t.plain_text).join('');
          const status = block.to_do.checked ? '[x]' : '[ ]';
          content += `${status} ${text}\n`;
          
          if (!block.to_do.checked) {
            todos.push(text);
          }
        }
      }

      return { content, todos };
    } catch (error) {
      console.error(`Error fetching content for page ${pageId}:`, error);
      return { content: '', todos: [] };
    }
  }

  /**
   * Get formatted summary of recent activity
   */
  async getRecentActivitySummary() {
    const pages = await this.fetchRecentPages();
    const summary = [];

    for (const page of pages as any[]) {
        // Get Title safely
        let title = 'Untitled';
        if (page.properties) {
            // Search for the title property (it's dynamic in Notion)
            const titleProp = Object.values(page.properties).find((p: any) => p.id === 'title') as any;
            if (titleProp && titleProp.title && titleProp.title.length > 0) {
                title = titleProp.title[0].plain_text;
            }
        }

        const { content, todos } = await this.getPageContent(page.id);
        
        summary.push({
            id: page.id,
            title,
            lastEdited: page.last_edited_time,
            url: page.url,
            contentPreview: content.slice(0, 500), // First 500 chars
            openTodos: todos
        });
    }

    return summary;
  }
}

