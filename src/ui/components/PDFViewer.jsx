import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../public/pdf.worker.js';

// Add electron import

function IconButton({ onClick, disabled, title, className, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded hover:bg-gray-700 tooltip ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className || ''}`}
    >
      {children}
    </button>
  );
}

function PDFViewer({ pdfUrl, filePath, onClose }) {
  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [pdf, setPdf] = useState(null);

  // Refs
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const mountedRef = useRef(true);
  const renderingRef = useRef(false);
  const pendingRenderRef = useRef(null);

  // Get filename from parent component's selectedAttachment
  const fileName = pdfUrl?.split('/').pop()?.split('?')[0] || 'Document';

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, []);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !containerRef.current || !mountedRef.current) {
      return;
    }

    // If already rendering, schedule this render for after the current one
    if (renderingRef.current) {
      pendingRenderRef.current = { scale, currentPage, fitToWidth };
      return;
    }

    renderingRef.current = true;

    try {
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(currentPage);
      
      if (!mountedRef.current || !canvasRef.current) {
        page.cleanup();
        return;
      }

      const canvas = canvasRef.current;
      const container = containerRef.current;
      const context = canvas.getContext('2d');

      // Calculate scale to fit container width while maintaining aspect ratio
      const viewport = page.getViewport({ scale: 1.0 });
      let finalScale = scale;
      
      if (fitToWidth) {
        const padding = 32; // Account for padding
        const availableWidth = container.clientWidth - padding;
        const scaleFactor = availableWidth / viewport.width;
        finalScale = scaleFactor;
        if (mountedRef.current) {
          setScale(scaleFactor);
        }
      }

      // Get the viewport with the final scale
      const scaledViewport = page.getViewport({ scale: finalScale });

      // Set canvas dimensions
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width = `${scaledViewport.width}px`;
      canvas.style.height = `${scaledViewport.height}px`;

      // Clear previous content
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;

    } catch (err) {
      if (!mountedRef.current) return;

      if (err.name === 'RenderingCancelledException') {
        console.log('Rendering was cancelled');
      } else {
        console.error('Error rendering page:', err);
        setError('Error rendering page: ' + err.message);
      }
    } finally {
      renderingRef.current = false;
      
      // Check if there's a pending render
      if (pendingRenderRef.current) {
        const { scale: pendingScale, currentPage: pendingPage, fitToWidth: pendingFitToWidth } = pendingRenderRef.current;
        pendingRenderRef.current = null;
        
        // Only re-render if the parameters have changed
        if (scale !== pendingScale || currentPage !== pendingPage || fitToWidth !== pendingFitToWidth) {
          renderPage();
        }
      }
    }
  }, [pdf, currentPage, scale, fitToWidth]);

  // Load PDF when URL changes
  useEffect(() => {
    const loadPDF = async () => {
      if (!pdfUrl || !mountedRef.current) return;

      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdfDoc = await loadingTask.promise;

        if (!mountedRef.current) {
          pdfDoc.destroy();
          return;
        }

        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error('Error loading PDF:', err);
        if (mountedRef.current) {
          setError('Error loading PDF: ' + err.message);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      if (pdf) {
        pdf.destroy();
      }
    };
  }, [pdfUrl]);

  // Render page when needed
  useEffect(() => {
    if (pdf && canvasRef.current && containerRef.current && mountedRef.current) {
      renderPage();
    }
  }, [renderPage, pdf]);

  // Handle window resize
  useEffect(() => {
    let resizeTimeout;
    
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      
      resizeTimeout = setTimeout(() => {
        if (mountedRef.current) {
          renderPage();
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [renderPage]);

  // Navigation handlers
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < numPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, numPages]);

  const handleZoomIn = useCallback(() => {
    setFitToWidth(false);
    setScale(prev => Math.min(prev + 0.1, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitToWidth(false);
    setScale(prev => Math.max(prev - 0.1, 0.1));
  }, []);

  const handleFitToWidth = useCallback(() => {
    setFitToWidth(true);
  }, []);

  const handleActualSize = useCallback(() => {
    setFitToWidth(false);
    setScale(1.0);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPreviousPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage]);

  const handlePrint = useCallback(async () => {
    if (!pdf) return;

    try {
      // Get the current page
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      
      // Print directly without preview
      window.print();
    } catch (error) {
      console.error('Error printing:', error);
    }
  }, [pdf, currentPage]);

  const handleShare = useCallback(async () => {
    if (!pdf || !filePath) return;

    try {
      // Use the actual file path for sharing
      const result = await ipcRenderer.invoke('share-file', filePath);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to share file');
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      setError('Error sharing PDF: ' + error.message);
    }
  }, [pdf, filePath]);

  if (!pdfUrl) {
    return <div className="text-center p-4">Waiting for valid PDF URL...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-100">
      {/* Add tooltip styles */}
      <style>
        {`
          .tooltip {
            position: relative;
          }
          .tooltip:hover::before {
            content: attr(title);
            position: absolute;
            top: -28px;
            left: 50%;
            transform: translateX(-50%);
            padding: 4px 8px;
            border-radius: 4px;
            background-color: rgba(17, 24, 39, 0.95);
            color: white;
            font-size: 12px;
            white-space: nowrap;
            z-index: 50;
          }
          .tooltip:hover::after {
            content: '';
            position: absolute;
            top: -8px;
            left: 50%;
            transform: translateX(-50%);
            border-width: 4px;
            border-style: solid;
            border-color: rgba(17, 24, 39, 0.95) transparent transparent transparent;
            z-index: 50;
          }
        `}
      </style>

      {/* Toolbar */}
      <div className="toolbar flex items-center justify-between px-2 py-0.5 bg-gray-800 text-white shadow-md">
        <div className="flex items-center gap-1">
          <IconButton
            onClick={goToPreviousPage}
            disabled={currentPage <= 1}
            title="Previous Page (Left Arrow)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </IconButton>

          <div className="text-sm">
            Page <input 
              type="number" 
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value);
                if (page >= 1 && page <= numPages) {
                  setCurrentPage(page);
                }
              }}
              className="w-12 px-1 py-0.5 text-center text-black rounded"
            /> of {numPages}
          </div>

          <IconButton
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            title="Next Page (Right Arrow)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </IconButton>
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </IconButton>

          <select
            value={scale}
            onChange={(e) => {
              setFitToWidth(false);
              setScale(parseFloat(e.target.value));
            }}
            className="bg-gray-700 text-white text-sm rounded px-2 py-1"
            title="Zoom Level"
          >
            {scale !== 0.5 && scale !== 0.75 && scale !== 1 && scale !== 1.25 && scale !== 1.5 && scale !== 2 && (
              <option value={scale}>{Math.round(scale * 100)}%</option>
            )}
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>

          <IconButton
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </IconButton>

          <div className="h-6 border-l border-gray-600 mx-1" />

          <IconButton
            onClick={handleFitToWidth}
            title="Fit to Width"
            className={fitToWidth ? 'bg-gray-700' : ''}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21V3m16 0v18M8 12h8" />
            </svg>
          </IconButton>

          <IconButton
            onClick={handleActualSize}
            title="Actual Size (100%)"
            className={!fitToWidth && scale === 1.0 ? 'bg-gray-700' : ''}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8v8m16-8v8M8 12h8" />
            </svg>
          </IconButton>

          <div className="h-6 border-l border-gray-600 mx-1" />

          <IconButton
            onClick={handlePrint}
            title="Print Document"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </IconButton>

          <IconButton
            onClick={handleShare}
            title="Share Document"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* PDF Viewer */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-200"
        style={{ height: 'calc(100vh - 48px)' }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}
        <div className="flex justify-center p-4">
          <canvas
            ref={canvasRef}
            className="shadow-lg bg-white"
          />
        </div>
      </div>
    </div>
  );
}

export default PDFViewer;
