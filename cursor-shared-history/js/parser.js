/**
 * Parser for Cursor chat markdown files
 * Converts Cursor markdown format to structured chat messages
 */

class CursorChatParser {
  /**
   * Parse the markdown content into a structured array of messages
   * @param {string} markdown - The raw markdown content
   * @returns {Object} - Object containing title, date, and messages array
   */
  static parse(markdown) {
    try {
      // Extract title and date from the header
      const headerInfo = this.extractHeaderInfo(markdown);
      
      // Pre-process to remove leading comments and the first H1 header line (robust to extra comments/lines)
      let content = markdown
        // remove any leading HTML comment blocks (e.g., SpecStory + session metadata)
        .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, '')
        // remove the first H1 header line and any following blank lines
        .replace(/^\s*#\s+.*\n+/, '');
      
      // Find all user and assistant messages
      const messages = this.extractMessages(content);
      
      return {
        title: headerInfo.title || 'Cursor AI Chat',
        date: headerInfo.date || new Date().toLocaleDateString(),
        messages
      };
    } catch (error) {
      console.error('Error parsing markdown:', error);
      throw new Error('Failed to parse markdown content');
    }
  }
  
  /**
   * Extract title and date information from the markdown header
   * @param {string} markdown - The raw markdown content
   * @returns {Object} - Object containing title and date
   */
  static extractHeaderInfo(markdown) {
    // Look for the first H1 line anywhere in the document (robust to leading comments/metadata)
    const h1Match = markdown.match(/^\s*#\s+(.+?)(?:\s+\(([^)]+)\))?\s*$/m);
    if (h1Match) {
      const title = h1Match[1];
      const dateStr = h1Match[2];
      let date = null;
      if (dateStr) {
        // Try to parse a variety of date formats; if fails, keep the raw string
        const parsed = new Date(dateStr);
        date = isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString();
      }
      return { title, date };
    }
    return { title: null, date: null };
  }
  
  /**
   * Extract messages from the markdown content
   * @param {string} content - The markdown content without the header
   * @returns {Array} - Array of message objects
   */
  static extractMessages(content) {
    const messages = [];
    
    // Regular expression to find user and assistant messages
    // Accept optional extra info in parentheses after the role (e.g., timestamps/model names), and flexible spacing
    const regex = /_\*\*(User|Assistant)[^*]*\*\*_\s*\n+([\s\S]*?)(?=_\*\*(?:User|Assistant)[^*]*\*\*_|$)/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const role = match[1].toLowerCase();
      let messageContent = match[2].trim();
      
      // Remove the triple-dash separator at the end if it exists
      messageContent = messageContent.replace(/\n---\s*$/, '');
      
      // Skip empty messages
      if (messageContent.trim().length === 0) {
        continue;
      }
      
      messages.push({
        role,
        content: messageContent
      });
    }
    
    return messages;
  }
} 