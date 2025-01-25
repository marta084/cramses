const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MsgReader = require('@kenjiuno/msgreader').default;
require('@electron/remote/main').initialize();

// Load our native module
let nativeShare;
try {
  nativeShare = require('../build/Release/native_share');
  console.log('Native share module loaded successfully');
} catch (error) {
  console.error('Failed to load native share module:', error);
  nativeShare = null;
}

let mainWindow;
const tempDir = path.join(os.tmpdir(), 'msg-viewer-temp');

// Register all IPC handlers
ipcMain.handle('share-file', async (event, tempPath) => {
  try {
    if (!tempPath) {
      throw new Error('No file path provided');
    }
    
    // Ensure the file exists
    if (!fs.existsSync(tempPath)) {
      throw new Error('File not found: ' + tempPath);
    }

    if (process.platform === 'darwin' && nativeShare) {
      try {
        // Get the position of the share button relative to the window
        const buttonPosition = await event.sender.executeJavaScript(`
          (function() {
            const button = document.querySelector('[title="Share Document"]');
            if (!button) throw new Error('Share button not found');
            const rect = button.getBoundingClientRect();
            return {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.bottom)
            };
          })();
        `);

        console.log('Button position:', buttonPosition);
        
        // Use our native sharing module with window-relative coordinates
        nativeShare.showShareSheet(tempPath, buttonPosition.x, buttonPosition.y);
      } catch (error) {
        console.error('Error getting button position:', error);
        // Fallback to a default position if we can't find the button
        nativeShare.showShareSheet(tempPath, 100, 100);
      }
    } else {
      console.log('Falling back to showItemInFolder for:', tempPath);
      shell.showItemInFolder(tempPath);
    }

    return { success: true };
  } catch (error) {
    console.error('Error sharing file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Outlook Messages', extensions: ['msg'] }],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('read-msg-file', async (event, filePath) => {
  try {
    console.log('Reading .msg file:', filePath);
    const msgFileBuffer = fs.readFileSync(filePath);
    const msgReader = new MsgReader(msgFileBuffer);
    const fileData = msgReader.getFileData();
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Extract attachments
    const attachments = (fileData.attachments || []).map((attachment, index) => {
      console.log(`Processing attachment ${index + 1}/${fileData.attachments.length}:`, attachment.fileName);
      
      try {
        const msgAttachment = msgReader.getAttachment(attachment);
        console.log('Attachment content length:', msgAttachment.content.length);
        
        // Ensure content is a Buffer
        const content = Buffer.isBuffer(msgAttachment.content) ? 
          msgAttachment.content : 
          Buffer.from(msgAttachment.content);
        
        // Save attachment to temp file
        const attachmentPath = path.join(tempDir, `${Date.now()}-${index}-${msgAttachment.fileName}`);
        fs.writeFileSync(attachmentPath, content);
        console.log('Saved attachment to:', attachmentPath);
        
        const fileType = getFileType(msgAttachment.fileName);
        console.log('File type:', fileType);
        
        let previewUrl = null;
        
        if (fileType === 'pdf') {
          // For PDFs, try to create preview URL
          try {
            console.log('Creating PDF preview URL...');
            previewUrl = createDataUrl(content, msgAttachment.fileName);
            console.log('PDF preview URL created successfully');
          } catch (error) {
            console.error('Error creating PDF preview:', error);
          }
        } else if (fileType === 'image') {
          // For images, create preview URL directly
          try {
            previewUrl = createDataUrl(content, msgAttachment.fileName);
          } catch (error) {
            console.error('Error creating image preview:', error);
          }
        }

        return {
          fileName: msgAttachment.fileName,
          tempPath: attachmentPath,
          size: content.length,
          type: fileType,
          previewUrl
        };
      } catch (error) {
        console.error('Error processing attachment:', error);
        return {
          fileName: attachment.fileName,
          error: error.message,
          type: getFileType(attachment.fileName),
          size: 0
        };
      }
    });

    const result = {
      subject: fileData.subject || '',
      from: fileData.senderName || fileData.senderEmail || '',
      to: Array.isArray(fileData.recipients) ? fileData.recipients.map(r => r.name || r.email) : [],
      date: fileData.date || new Date(),
      body: fileData.body || '',
      attachments
    };

    console.log('Email processing complete:', {
      subject: result.subject,
      attachmentsCount: result.attachments.length,
      attachments: result.attachments.map(a => ({
        fileName: a.fileName,
        type: a.type,
        size: a.size,
        hasPreviewUrl: !!a.previewUrl
      }))
    });

    return result;
  } catch (error) {
    console.error('Error processing .msg file:', error);
    throw error;
  }
});

ipcMain.handle('save-attachment', async (event, { tempPath, fileName }) => {
  try {
    const defaultPath = path.join(app.getPath('downloads'), fileName);
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePath) {
      fs.copyFileSync(tempPath, filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error saving attachment:', error);
    throw error;
  }
});

// Helper function to get file type
function getFileType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return 'image';
  } else if (['.pdf'].includes(ext)) {
    return 'pdf';
  } else if (['.doc', '.docx'].includes(ext)) {
    return 'word';
  } else if (['.xls', '.xlsx'].includes(ext)) {
    return 'excel';
  } else if (['.txt', '.rtf', '.md'].includes(ext)) {
    return 'text';
  }
  return 'other';
}

// Helper function to validate PDF content
function validatePDFContent(content) {
  try {
    // Ensure we have a Buffer
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    
    // Check for PDF signature
    const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    const firstBytes = buffer.subarray(0, 4);
    console.log('PDF signature check:', {
      found: Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
      expected: Array.from(pdfSignature).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
    
    if (!firstBytes.equals(pdfSignature)) {
      console.error('Invalid PDF signature');
      return false;
    }

    // Check for minimum size (at least 1KB)
    if (buffer.length < 1024) {
      console.error('PDF too small:', buffer.length, 'bytes');
      return false;
    }

    // Check for EOF marker
    const lastBytes = buffer.subarray(-1024); // Check last 1KB
    const eofMarker = Buffer.from('%%EOF');
    const hasEOF = lastBytes.includes(eofMarker);
    console.log('EOF marker found:', hasEOF);
    
    if (!hasEOF) {
      console.error('No PDF EOF marker found');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating PDF:', error);
    return false;
  }
}

// Helper function to create a data URL
function createDataUrl(content, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  
  try {
    // Ensure we have a Buffer
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    
    if (ext === '.pdf') {
      console.log('Validating PDF content for:', fileName);
      console.log('PDF size:', buffer.length, 'bytes');
      
      if (!validatePDFContent(buffer)) {
        throw new Error('Invalid PDF content');
      }
      console.log('PDF validation passed');
    }

    // Create base64 string
    const base64Data = buffer.toString('base64');
    console.log('Base64 length:', base64Data.length);
    
    // Create data URL
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    console.log('Data URL created successfully');
    
    // Verify data URL format
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
      throw new Error('Invalid data URL format');
    }
    
    return dataUrl;
  } catch (error) {
    console.error('Error creating data URL:', error);
    throw error;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Set CSP header to allow loading worker from CDN
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:"]
      }
    });
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    console.log('Loading development URL...');
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open the DevTools in development mode.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up temp files when the app is about to quit
app.on('before-quit', () => {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error('Error cleaning up temp directory:', error);
  }
});
