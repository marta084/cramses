import React, { useState, useCallback } from 'react';
import PDFViewer from './components/PDFViewer';


// File type icons component
const FileIcon = ({ type }) => {
  const iconClass = {
    pdf: 'text-red-500',
    word: 'text-blue-500',
    excel: 'text-green-500',
    text: 'text-gray-500',
    other: 'text-gray-400'
  }[type] || 'text-gray-400';

  return (
    <div className={`w-12 h-12 flex items-center justify-center rounded-lg bg-gray-100 ${iconClass}`}>
      {type === 'pdf' && (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )}
      {type === 'word' && (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )}
      {(type === 'excel' || type === 'text' || type === 'other') && (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )}
    </div>
  );
};

function App() {
  const [emailData, setEmailData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAttachment, setSelectedAttachment] = useState(null);

  const handleFileOpen = async () => {
    try {
      const filePath = await window.electron.ipcInvoke('open-file-dialog');
      if (filePath) {
        await loadMsgFile(filePath);
      }
    } catch (err) {
      setError('Error opening file: ' + err.message);
    }
  };

  const loadMsgFile = async (filePath) => {
    try {
      setLoading(true);
      setError(null);
      const data = await ipcRenderer.invoke('read-msg-file', filePath);
      console.log('Loaded MSG file data:', {
        subject: data.subject,
        attachments: data.attachments.map(a => ({
          fileName: a.fileName,
          type: a.type,
          size: a.size,
          hasPreviewUrl: !!a.previewUrl,
          previewUrlPrefix: a.previewUrl ? a.previewUrl.substring(0, 50) + '...' : null
        }))
      });
      setEmailData(data);
    } catch (err) {
      console.error('Error loading MSG file:', err);
      setError('Error reading file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.path.toLowerCase().endsWith('.msg')) {
      await loadMsgFile(file.path);
    } else {
      setError('Please drop a valid .msg file');
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleSaveAttachment = async (tempPath, fileName) => {
    try {
      await ipcRenderer.invoke('save-attachment', { tempPath, fileName });
    } catch (err) {
      setError('Error saving attachment: ' + err.message);
    }
  };

  const handleAttachmentClick = (attachment) => {
    console.log('Selected attachment:', {
      fileName: attachment.fileName,
      type: attachment.type,
      size: attachment.size,
      hasPreviewUrl: !!attachment.previewUrl,
      previewUrlPrefix: attachment.previewUrl ? attachment.previewUrl.substring(0, 50) + '...' : null
    });
    setSelectedAttachment(attachment);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">MSG Viewer</h1>
          <p className="text-gray-600">View Outlook .msg files with ease</p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`
            w-full p-8 mb-8 border-2 border-dashed rounded-lg 
            ${emailData ? 'border-gray-300 bg-white' : 'border-blue-400 bg-blue-50'} 
            flex flex-col items-center justify-center
            transition-all duration-200 hover:border-blue-500 hover:bg-blue-50
          `}
        >
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Drag and drop a .msg file here, or
            </p>
            <button
              onClick={handleFileOpen}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 
                transition-colors duration-200 focus:outline-none focus:ring-2 
                focus:ring-blue-500 focus:ring-offset-2"
            >
              Open File
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading email...</p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Email content */}
        {emailData && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            {/* Email header */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">{emailData.subject}</h2>
              <div className="space-y-2 text-sm text-gray-600">
                <p><span className="font-semibold">From:</span> {emailData.from}</p>
                <p><span className="font-semibold">To:</span> {emailData.to.join(', ')}</p>
                <p><span className="font-semibold">Date:</span> {new Date(emailData.date).toLocaleString()}</p>
              </div>
            </div>

            {/* Email body */}
            <div className="p-6 bg-gray-50">
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700">{emailData.body}</div>
              </div>
            </div>

            {/* Attachments with preview */}
            {emailData.attachments.length > 0 && (
              <div className="border-t border-gray-200 p-6">
                <h3 className="font-semibold text-gray-700 mb-4">Attachments</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {emailData.attachments.map((attachment, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        selectedAttachment === attachment
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      } transition-colors cursor-pointer`}
                      onClick={() => handleAttachmentClick(attachment)}
                    >
                      <div className="flex items-start space-x-4">
                        {attachment.type === 'image' && attachment.previewUrl ? (
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.fileName}
                            className="w-12 h-12 object-cover rounded-lg"
                          />
                        ) : (
                          <FileIcon type={attachment.type} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {attachment.fileName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(attachment.size)}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveAttachment(attachment.tempPath, attachment.fileName);
                            }}
                            className="mt-2 text-sm text-blue-500 hover:text-blue-600 font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Preview modal for selected attachment */}
                {selectedAttachment && (selectedAttachment.type === 'image' || selectedAttachment.type === 'pdf') && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
                      <div className="flex justify-between items-center p-4 border-b border-gray-200">
                        <h4 className="text-lg font-semibold text-gray-900">
                          {selectedAttachment.fileName}
                        </h4>
                        <button
                          onClick={() => setSelectedAttachment(null)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="flex-1 overflow-auto p-4">

                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
