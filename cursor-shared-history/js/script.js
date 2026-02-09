document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const backToTopBtn = document.getElementById('back-to-top');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const fileUpload = document.getElementById('file-upload');
  const pasteBtn = document.getElementById('paste-btn');
  const sharedChatsSelect = document.getElementById('shared-chats');
  const pasteSection = document.getElementById('paste-section');
  const inputSection = document.getElementById('input-section');
  const chatSection = document.getElementById('chat-section');
  const markdownContent = document.getElementById('markdown-content');
  const processPasteBtn = document.getElementById('process-paste-btn');
  const cancelPasteBtn = document.getElementById('cancel-paste-btn');
  const backBtn = document.getElementById('back-btn');
  const chatContainer = document.getElementById('chat-container');
  const chatTitle = document.getElementById('chat-title');
  const chatDate = document.getElementById('chat-date');

  // Initially hide back to top button
  backToTopBtn.classList.remove('show');

  // Parse URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const chatParam = urlParams.get('chat');
  const messageParam = urlParams.get('message');

  // Process any tables in details elements that weren't properly formatted
  function processTablesInDetailsElements() {
    document.querySelectorAll('details').forEach((details) => {
      const content = details.innerHTML;
      if (content.includes('|') && content.includes('|-')) {
        // Find all tables in the details element
        // Use a more precise pattern that separates tables from each other

        // Replace only table structures, not the surrounding content
        const tablePattern = /\|\s*(.*?)\s*\|\s*\n\s*\|([-:\s|]+)\|\s*\n((?:.*\|.*\n)+?)(?=\n\s*\n|\n\s*\|.*?\|\s*\n\s*\|[-:\s|]+\||\n<|\n```|$)/g;

        // Instead of replacing the entire content, find and transform each table separately
        let processedContent = '';
        let lastIndex = 0;
        let match;

        // Clone the content to work with
        const tempContent = content;

        // First, find the summary and keep it intact
        const summaryEndIndex = tempContent.indexOf('</summary>') + 10;
        processedContent = tempContent.substring(0, summaryEndIndex);
        lastIndex = summaryEndIndex;

        // Now process each table separately
        while ((match = tablePattern.exec(tempContent)) !== null) {
          // Add any content between the last table and this one
          processedContent += tempContent.substring(lastIndex, match.index);

          // Process this table
          const [ fullMatch, header, separator, rows ] = match;

          // Process the header
          const headers = header.split('|').map((col) => col.trim()).filter(Boolean);

          // Process the separator line to determine alignment
          const separatorParts = separator.split('|').map((col) => {
            const trimmed = col.trim();
            if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
            if (trimmed.endsWith(':')) return 'right';

            return 'left';
          }).filter(Boolean);

          // Build the table HTML
          let tableHtml = '<div class="table-wrapper"><table><thead><tr>';
          headers.forEach((headerText, i) => {
            const align = separatorParts[i] || 'left';
            tableHtml += `<th style="text-align: ${ align }">${ headerText }</th>`;
          });
          tableHtml += '</tr></thead><tbody>';

          // Process the rows
          rows.split('\n').forEach((row) => {
            if (row.trim() && row.includes('|')) {
              const cells = row.split('|').map((cell) => cell.trim()).filter(Boolean);
              tableHtml += '<tr>';
              cells.forEach((cellText, i) => {
                if (i < headers.length) {
                  const align = separatorParts[i] || 'left';
                  tableHtml += `<td style="text-align: ${ align }">${ cellText }</td>`;
                }
              });
              tableHtml += '</tr>';
            }
          });

          tableHtml += '</tbody></table></div>';

          // Add the processed table to our output
          processedContent += tableHtml;

          // Update lastIndex for the next iteration
          lastIndex = match.index + fullMatch.length;
        }

        // Add any remaining content after the last table
        processedContent += tempContent.substring(lastIndex);

        // Update the details element with our processed content
        details.innerHTML = processedContent;
      }
    });
  }

  // Back to top button functionality
  window.addEventListener('scroll', function() {
    if (window.scrollY > 300) {
      backToTopBtn.classList.add('show');
    } else {
      backToTopBtn.classList.remove('show');
    }
  });

  backToTopBtn.addEventListener('click', function() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  // Theme toggle functionality
  themeToggleBtn.addEventListener('click', function() {
    document.body.classList.toggle('light-theme');

    // Save preference to localStorage
    if (document.body.classList.contains('light-theme')) {
      localStorage.setItem('theme', 'light');
    } else {
      localStorage.setItem('theme', 'dark');
    }
  });

  // Add event listener for details elements to process tables when opened
  chatContainer.addEventListener('toggle', function(e) {
    if (e.target.tagName === 'DETAILS' && e.target.open) {
      // Process tables in this specific details element
      const details = e.target;

      const content = details.innerHTML;
      if (content.includes('|') && content.includes('|-')) {
        // Find all tables in the details element
        // Use a more precise pattern that separates tables from each other

        // Replace only table structures, not the surrounding content
        const tablePattern = /\|\s*(.*?)\s*\|\s*\n\s*\|([-:\s|]+)\|\s*\n((?:.*\|.*\n)+?)(?=\n\s*\n|\n\s*\|.*?\|\s*\n\s*\|[-:\s|]+\||\n<|\n```|$)/g;

        // Instead of replacing the entire content, find and transform each table separately
        let processedContent = '';
        let lastIndex = 0;
        let match;

        // Clone the content to work with
        const tempContent = content;

        // First, find the summary and keep it intact
        const summaryEndIndex = tempContent.indexOf('</summary>') + 10;
        processedContent = tempContent.substring(0, summaryEndIndex);
        lastIndex = summaryEndIndex;

        // Now process each table separately
        while ((match = tablePattern.exec(tempContent)) !== null) {
          // Add any content between the last table and this one
          processedContent += tempContent.substring(lastIndex, match.index);

          // Process this table
          const [ fullMatch, header, separator, rows ] = match;

          // Process the header
          const headers = header.split('|').map((col) => col.trim()).filter(Boolean);

          // Process the separator line to determine alignment
          const separatorParts = separator.split('|').map((col) => {
            const trimmed = col.trim();
            if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
            if (trimmed.endsWith(':')) return 'right';

            return 'left';
          }).filter(Boolean);

          // Build the table HTML
          let tableHtml = '<div class="table-wrapper"><table><thead><tr>';
          headers.forEach((headerText, i) => {
            const align = separatorParts[i] || 'left';
            tableHtml += `<th style="text-align: ${ align }">${ headerText }</th>`;
          });
          tableHtml += '</tr></thead><tbody>';

          // Process the rows
          rows.split('\n').forEach((row) => {
            if (row.trim() && row.includes('|')) {
              const cells = row.split('|').map((cell) => cell.trim()).filter(Boolean);
              tableHtml += '<tr>';
              cells.forEach((cellText, i) => {
                if (i < headers.length) {
                  const align = separatorParts[i] || 'left';
                  tableHtml += `<td style="text-align: ${ align }">${ cellText }</td>`;
                }
              });
              tableHtml += '</tr>';
            }
          });

          tableHtml += '</tbody></table></div>';

          // Add the processed table to our output
          processedContent += tableHtml;

          // Update lastIndex for the next iteration
          lastIndex = match.index + fullMatch.length;
        }

        // Add any remaining content after the last table
        processedContent += tempContent.substring(lastIndex);

        // Update the details element with our processed content
        details.innerHTML = processedContent;
      }
    }
  }, true);

  // Check for saved theme preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  }

  // File upload handler
  fileUpload.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const markdownText = e.target.result;
      processMarkdown(markdownText);
    };
    reader.readAsText(file);
  });

  // Paste button handler
  pasteBtn.addEventListener('click', function() {
    inputSection.classList.add('hidden');
    pasteSection.classList.remove('hidden');
    markdownContent.focus();
  });

  // Process paste button handler
  processPasteBtn.addEventListener('click', function() {
    const markdownText = markdownContent.value.trim();
    if (!markdownText) {
      showNotification('Please paste some markdown content first.', 'error');

      return;
    }

    processMarkdown(markdownText);
    pasteSection.classList.add('hidden');
  });

  // Cancel paste button handler
  cancelPasteBtn.addEventListener('click', function() {
    pasteSection.classList.add('hidden');
    inputSection.classList.remove('hidden');
    markdownContent.value = '';
  });

  // Back button handler
  backBtn.addEventListener('click', function() {
    chatSection.classList.add('hidden');
    inputSection.classList.remove('hidden');
    chatContainer.innerHTML = '';
    fileUpload.value = '';
    sharedChatsSelect.value = '';

    // Remove the query parameters from the URL
    updateUrlParams(null, null);
  });

  // Load shared chats from the chats directory
  loadSharedChats();

  // Shared chats selection handler
  sharedChatsSelect.addEventListener('change', (event) => {
    const selectedChat = event.target.value;
    if (!selectedChat) return;

    // Update URL with the selected chat path
    updateUrlParams(selectedChat, null);

    // Fetch the selected markdown file
    fetchAndDisplayChat(selectedChat);
  });

  /**
   * Fetch and display a chat file
   * @param {string} chatPath - Path to the chat file
   */
  function fetchAndDisplayChat(chatPath) {
    fetch(chatPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load chat file: ${ chatPath }`);
        }

        return response.text();
      })
      .then((markdownText) => {
        processMarkdown(markdownText, chatPath);
      })
      .catch((error) => {
        console.error('Error loading shared chat:', error);
        showNotification(`Failed to load selected chat: ${ error.message }`, 'error');
      });
  }

  /**
   * Process the markdown text and render the chat
   * @param {string} markdownText - The markdown text to process
   * @param {string} chatPath - Path to the chat file (optional)
   */
  function processMarkdown(markdownText, chatPath = null) {
    try {
      // Parse the markdown using the CursorChatParser
      const chatData = CursorChatParser.parse(markdownText);

      // Update the UI
      chatTitle.textContent = chatData.title;
      chatDate.textContent = chatData.date;

      // Hide input section and show chat section
      inputSection.classList.add('hidden');
      pasteSection.classList.add('hidden');
      chatSection.classList.remove('hidden');

      // Render the chat messages
      renderChat(chatData.messages, chatPath);

      // Scroll to top
      window.scrollTo(0, 0);

      // If there's a message parameter in the URL, scroll to that message
      if (messageParam && chatPath) {
        scrollToHighlightedMessage(parseInt(messageParam, 10));
      }
    } catch (error) {
      console.error('Error processing markdown:', error);
      showNotification('Failed to process the markdown. Is it in the correct Cursor chat format?', 'error');
    }
  }

  /**
   * Render the chat messages in the chat container
   * @param {Array} messages - Array of message objects
   * @param {string} chatPath - Path to the chat file (optional)
   */
  function renderChat(messages, chatPath = null) {
    chatContainer.innerHTML = '';

    messages.forEach((message, index) => {
      const messageEl = createMessageElement(message, index, chatPath);
      chatContainer.appendChild(messageEl);
    });

    // Apply syntax highlighting to code blocks
    document.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightBlock(block);
    });

    // Process any tables in details elements
    processTablesInDetailsElements();

    // Check if we need to show the back to top button after content is loaded
    if (window.scrollY > 300) {
      backToTopBtn.classList.add('show');
    }
  }

  /**
   * Create a message element from a message object
   * @param {Object} message - Message object with role and content
   * @param {number} index - Index of the message
   * @param {string} chatPath - Path to the chat file (optional)
   * @returns {HTMLElement} - The message element
   */
  function createMessageElement(message, index, chatPath = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${ message.role === 'user' ? 'user-message' : 'assistant-message' }`;
    messageDiv.id = `message-${ index }`;

    // Check if this message should be highlighted
    const highlightedMessage = messageParam === index.toString();
    if (highlightedMessage) {
      messageDiv.classList.add('highlighted-message');
    }

    // Create avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = `avatar ${ message.role === 'user' ? 'user-avatar' : 'assistant-avatar' }`;

    if (message.role === 'user') {
      avatarDiv.textContent = 'U';
    } else {
      // Cursor logo for assistant
      avatarDiv.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.5 12.5L12.5 20L22.5 27.5V12.5Z" fill="white"/>
          <path d="M27.5 12.5L17.5 20L27.5 27.5V12.5Z" fill="#6366F1"/>
        </svg>
      `;
    }

    // Create message content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Create message header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';

    const senderDiv = document.createElement('div');
    senderDiv.className = `message-sender ${ message.role === 'assistant' ? 'assistant-sender' : '' }`;
    senderDiv.textContent = message.role === 'user' ? 'User' : 'Cursor AI';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    // We don't have real timestamps, so using a placeholder or the chat date
    timeDiv.textContent = chatDate.textContent || 'Today';

    // Add clickable link icon if chat path is provided
    if (chatPath) {
      const linkIcon = document.createElement('span');
      linkIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="link-icon"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
      linkIcon.className = 'message-link';
      linkIcon.title = 'Copy link to this message';
      linkIcon.addEventListener('click', (e) => {
        e.preventDefault();
        updateUrlParams(chatPath, index);
        copyToClipboard(window.location.href);
        showNotification('Link copied to clipboard!', 'success');
      });
      timeDiv.appendChild(linkIcon);
    }

    headerDiv.appendChild(senderDiv);
    headerDiv.appendChild(timeDiv);

    // Create message body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'message-body';

    // Check for and handle mode indicators
    let content = message.content;
    const modeMatch = content.match(/^\[MODE: ([A-Z]+)\]/);

    if (modeMatch && message.role === 'assistant') {
      const mode = modeMatch[1].toLowerCase();
      const modeIndicator = document.createElement('div');
      modeIndicator.className = `mode-indicator mode-${ mode }`;
      modeIndicator.textContent = `MODE: ${ modeMatch[1] }`;
      contentDiv.appendChild(modeIndicator);

      // Remove the mode indicator from the content
      content = content.replace(/^\[MODE: [A-Z]+\]\n*/, '');
    }

    // Process the markdown content
    bodyDiv.innerHTML = processMarkdownContent(content);

    // Assemble the message
    contentDiv.appendChild(headerDiv);
    contentDiv.appendChild(bodyDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    return messageDiv;
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   */
  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  /**
   * Update URL parameters
   * @param {string|null} chatPath - Path to the chat file
   * @param {number|null} messageIndex - Index of the message
   */
  function updateUrlParams(chatPath, messageIndex) {
    const url = new URL(window.location.href);

    if (chatPath === null) {
      url.searchParams.delete('chat');
    } else {
      url.searchParams.set('chat', chatPath);
    }

    if (messageIndex === null) {
      url.searchParams.delete('message');
    } else {
      url.searchParams.set('message', messageIndex);
    }

    window.history.pushState({}, '', url);
  }

  /**
   * Scroll to and highlight a specific message
   * @param {number} messageIndex - Index of the message to highlight
   */
  function scrollToHighlightedMessage(messageIndex) {
    const messageElement = document.getElementById(`message-${ messageIndex }`);
    if (messageElement) {
      setTimeout(() => {
        // Get the position of the message relative to the document
        const messageRect = messageElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const messageTop = messageRect.top + scrollTop;

        // Get the header height to avoid scrolling content behind it
        const headerHeight = document.querySelector('header').offsetHeight;

        // Add offsets: header height + small offset (40px) to show a bit of the previous message
        const scrollPosition = messageTop - headerHeight - 40;

        // Smoothly scroll to the adjusted position
        window.scrollTo({
          top: scrollPosition,
          behavior: 'smooth'
        });
      }, 300);
    }
  }

  // Check if there's a chat parameter in the URL and load that chat
  if (chatParam) {
    fetchAndDisplayChat(chatParam);
  }

  /**
   * Process markdown content into HTML
   * @param {string} text - The markdown text to process
   * @returns {string} - HTML string
   */
  function processMarkdownContent(text) {
    // Process details elements containing markdown tables - fixed to preserve summary with markdown formatting
    text = text.replace(/```\n\n([\s\S]*?)(?=\n\|\s*.*?\|.*?\n\s*\|[-:\|\s]+\|)(\n\|\s*.*?\|.*?\n\s*\|[-:\|\s]+\|[\s\S]*?)(\n---)?\n```/g, function(match, summary, tableContent, ending) {
      // Extract the summary/title text
      const summaryText = summary.trim();

      // Create a details element with the table inside
      // Important: We're not processing the table content here
      // It will be processed separately after the details element is created
      return `<details>
        <summary>${ summaryText }</summary>
        ${ tableContent }
      </details>`;
    });

    // Process code blocks (after details elements to avoid conflicts)
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, language, code) {
      return `<pre><code class="${ language || '' }">${ escapeHtml(code.trim()) }</code></pre>`;
    });

    // Process inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Process markdown tables - with improved boundary detection
    text = text.replace(/\n\s*\|(.+?)\|\s*\n\s*\|([-:\s|]+)\|\s*\n([\s\S]*?)(?=\n\s*\n|\n\s*\|.*?\|\s*\n\s*\|[-:\s|]+\||\n<|\n```|$)/g, function(match, header, separator, rows) {
      // Process the header
      const headers = header.split('|').map((col) => col.trim()).filter(Boolean);

      // Process the separator line to determine alignment
      const aligns = separator.split('|').map((col) => {
        const trimmed = col.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';

        return 'left';
      }).filter(Boolean);

      // Build the header HTML
      let tableHtml = '<div class="table-wrapper"><table><thead><tr>';
      headers.forEach((headerText, i) => {
        const align = aligns[i] || 'left';
        tableHtml += `<th style="text-align: ${ align }">${ headerText }</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      // Process the rows
      rows.split('\n').forEach((row) => {
        if (row.trim() && row.includes('|')) {
          // Filter out empty cells to fix alignment
          const cells = row.split('|').map((cell) => cell.trim()).filter(Boolean);
          tableHtml += '<tr>';
          cells.forEach((cellText, i) => {
            // Only add as many cells as there are headers
            if (i < headers.length) {
              const align = aligns[i] || 'left';
              tableHtml += `<td style="text-align: ${ align }">${ cellText }</td>`;
            }
          });
          tableHtml += '</tr>';
        }
      });

      tableHtml += '</tbody></table></div>';

      return tableHtml;
    });

    // After all other processing, handle adding interactivity to details elements
    text = text.replace(/<\/details>/g, '</details><script>document.currentScript.previousElementSibling.addEventListener("toggle", function() { if(this.open) { hljs.highlightAll(); this.querySelectorAll("table").forEach(function(table) { table.style.visibility = "visible"; }); } });</script>');

    // Process bold text
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Process italic text
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Process links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Process lists
    text = text.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    // Process headers
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Process paragraphs (must be done last)
    text = text.replace(/(?:\r\n|\r|\n){2,}/g, '</p><p>');
    text = `<p>${ text }</p>`;
    text = text.replace(/<p><\/p>/g, '');

    // Process horizontal rules
    text = text.replace(/^---$/gm, '<hr>');

    return text;
  }

  /**
   * Escape HTML special characters
   * @param {string} text - The text to escape
   * @returns {string} - The escaped text
   */
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Load shared chats from the chats directory
   * This function will load chat files using a JSON index
   */
  function loadSharedChats() {
    // Fetch the chat index file instead of trying to list the directory
    fetch('chats.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load chats index');
        }

        return response.json();
      })
      .then((chatFiles) => {
        if (chatFiles && chatFiles.length > 0) {
          populateSharedChatsDropdown(chatFiles);
          showNotification(`Found ${ chatFiles.length } shared chat(s)`, 'success');
        } else {
          disableSharedChatsOption('No shared chats found');
        }
      })
      .catch((error) => {
        console.error('Error loading shared chats:', error);
        disableSharedChatsOption('Failed to load shared chats');
      });
  }

  /**
   * Populate the shared chats dropdown with the given files
   * @param {Array} files - Array of file objects with name and path
   */
  function populateSharedChatsDropdown(files) {
    // Sort files alphabetically by name
    files.sort((a, b) => a.name.localeCompare(b.name));

    // Clear any existing options first
    sharedChatsSelect.innerHTML = '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a shared chat...';
    sharedChatsSelect.appendChild(defaultOption);

    // Add each file to the dropdown
    files.forEach((file) => {
      const option = document.createElement('option');
      option.value = file.path;
      option.textContent = file.name;
      sharedChatsSelect.appendChild(option);
    });

    // Enable the dropdown
    sharedChatsSelect.disabled = false;
  }

  /**
   * Disable the shared chats option with a message
   * @param {string} message - The message to display
   */
  function disableSharedChatsOption(message) {
    // Clear any existing options
    sharedChatsSelect.innerHTML = '';

    const option = document.createElement('option');
    option.value = '';
    option.textContent = message;
    option.disabled = true;

    sharedChatsSelect.appendChild(option);
    sharedChatsSelect.disabled = true;
  }

  /**
   * Show a notification message
   * @param {string} message - The message to show
   * @param {string} type - The type of notification ('error' or 'success')
   */
  function showNotification(message, type = 'error') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${ type === 'error' ? 'error-notification' : 'success-notification' }`;
    notification.textContent = message;

    // Add close button
    const closeButton = document.createElement('span');
    closeButton.textContent = '×';
    closeButton.style.marginLeft = 'auto';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.fontSize = '18px';
    closeButton.addEventListener('click', () => notification.remove());

    notification.prepend(closeButton);

    // Insert notification into the dedicated container
    const notificationContainer = document.getElementById('notification-container');
    // Clear any previous notifications
    notificationContainer.innerHTML = '';
    notificationContainer.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
});
