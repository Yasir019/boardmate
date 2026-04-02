import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/pdfviewer.css';

function PdfViewer({ pdfUrl, chapterTitle }) {
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(115);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef(null);

  useEffect(() => {
    setError(false);
    setZoom(115);
  }, [pdfUrl, chapterTitle]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const handleZoomReset = () => {
    setZoom(115);
  };

  const toggleFullscreen = useCallback(() => {
    const el = viewerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!pdfUrl) {
    return (
      <div className="pdf-viewer empty">
        <div className="pdf-placeholder">
          <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <path d="M10 14h4"/>
            <path d="M10 10h2"/>
            <path d="M10 18h4"/>
          </svg>
          <p>Select a chapter to view</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-viewer error">
        <div className="pdf-error">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12" y2="16"/>
          </svg>
          <p>Failed to load PDF</p>
          <button onClick={() => setError(false)} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={viewerRef}>
      <div className="pdf-header">
        <h3>{chapterTitle || 'Chapter PDF'}</h3>
        <div className="pdf-controls">
          <button 
            onClick={handleZoomOut} 
            className="pdf-control-btn"
            title="Zoom Out"
            disabled={zoom <= 50}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          
          <span className="zoom-level">{zoom}%</span>
          
          <button 
            onClick={handleZoomIn} 
            className="pdf-control-btn"
            title="Zoom In"
            disabled={zoom >= 200}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          
          <button 
            onClick={handleZoomReset} 
            className="pdf-control-btn"
            title="Reset Zoom"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6"/>
              <path d="M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>

          <div className="pdf-divider"></div>

          <button 
            onClick={toggleFullscreen} 
            className="pdf-control-btn"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </button>
          
          <a 
            href={pdfUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="pdf-control-btn"
            title="Open in new tab"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
      <div className="pdf-container">
        <iframe
          src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`}
          title={chapterTitle || 'Chapter PDF'}
          className="pdf-iframe"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top left',
            width: `${10000 / zoom}%`,
            height: `${10000 / zoom}%`,
          }}
          onError={(e) => {
            console.error('PDF iframe error:', e);
            setError(true);
          }}
        >
          <p>Your browser does not support PDFs.{' '}
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Download the PDF</a>
          </p>
        </iframe>
      </div>
    </div>
  );
}

export default PdfViewer;
