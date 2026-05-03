// src/App.jsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useImageUpload } from './hooks/useImageUpload';
import './App.css';

// ─── Icons (inline SVG) ────────────────────────────────────────────────────

const UploadIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const ImageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDimensions(w, h) {
  if (!w || !h) return '—';
  return `${w}×${h}`;
}

// ─── Validation Badge ────────────────────────────────────────────────────────

function ValidationBadge({ result, label }) {
  if (!result) return null;
  const pass = result.passed !== false;
  return (
    <span className={`vbadge ${pass ? 'pass' : 'fail'}`}>
      {pass ? <CheckIcon /> : <XIcon />}
      {label}
    </span>
  );
}

// ─── Image Card ─────────────────────────────────────────────────────────────

function ImageCard({ image, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const isAccepted = image.status === 'accepted';
  const vr = image.validationResults || {};

  return (
    <div className={`image-card ${isAccepted ? 'card-accepted' : 'card-rejected'}`}>
      <div className="card-header">
        <div className="card-thumb-wrap">
          {image.preview || image.thumbnailUrl ? (
            <img
              src={image.preview || image.thumbnailUrl}
              alt={image.originalFilename}
              className="card-thumb"
            />
          ) : (
            <div className="card-thumb-placeholder"><ImageIcon /></div>
          )}
          <div className={`card-status-dot ${isAccepted ? 'dot-accepted' : 'dot-rejected'}`} />
        </div>

        <div className="card-info">
          <p className="card-filename" title={image.originalFilename}>
            {image.originalFilename}
          </p>
          <div className="card-meta">
            <span>{formatBytes(image.fileSize)}</span>
            {image.dimensions && (
              <span>{formatDimensions(image.dimensions.width, image.dimensions.height)}</span>
            )}
            {image.convertedFrom && (
              <span className="converted-badge">HEIC → JPEG</span>
            )}
          </div>

          {!isAccepted && image.rejectionReasons?.length > 0 && (
            <div className="rejection-reasons">
              {image.rejectionReasons.slice(0, expanded ? undefined : 1).map((r, i) => (
                <div key={i} className="reason-item">
                  <AlertIcon />
                  <span>{r}</span>
                </div>
              ))}
              {image.rejectionReasons.length > 1 && !expanded && (
                <button className="expand-btn" onClick={() => setExpanded(true)}>
                  +{image.rejectionReasons.length - 1} more reason{image.rejectionReasons.length > 2 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </div>

        <button className="card-remove-btn" onClick={() => onRemove(image.id || image.localId, image.status)} title="Remove">
          <XIcon size={12} />
        </button>
      </div>

      {Object.keys(vr).length > 0 && (
        <div className="validation-badges">
          <ValidationBadge result={vr.format} label="Format" />
          <ValidationBadge result={vr.fileSize} label="Size" />
          <ValidationBadge result={vr.resolution} label="Resolution" />
          <ValidationBadge result={vr.blur} label="Sharpness" />
          <ValidationBadge result={vr.similarity} label="Unique" />
          <ValidationBadge result={vr.face} label="Face" />
        </div>
      )}
    </div>
  );
}

// ─── Queue Item ──────────────────────────────────────────────────────────────

function QueueItem({ item, onRemove }) {
  return (
    <div className="queue-item">
      {item.preview ? (
        <img src={item.preview} alt={item.originalFilename} className="queue-thumb" />
      ) : (
        <div className="queue-thumb-placeholder"><ImageIcon /></div>
      )}
      <div className="queue-info">
        <span className="queue-filename">{item.originalFilename}</span>
        <span className="queue-size">{formatBytes(item.fileSize)}</span>
      </div>
      <div className={`queue-status queue-${item.status}`}>
        {item.status === 'uploading' ? (
          <span className="spinner-sm" />
        ) : item.status === 'error' ? (
          <XIcon />
        ) : (
          <span className="queue-dot" />
        )}
      </div>
      {item.status === 'queued' && (
        <button className="queue-remove-btn" onClick={() => onRemove(item.id)}>
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Drop Zone ───────────────────────────────────────────────────────────────

function DropZone({ onDrop }) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
    multiple: true,
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${isDragReject ? 'dropzone-reject' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="dropzone-content">
        <div className={`dropzone-icon ${isDragActive ? 'icon-bounce' : ''}`}>
          <UploadIcon />
        </div>
        {isDragReject ? (
          <p className="dropzone-text">Only JPEG, PNG, and HEIC files are accepted</p>
        ) : isDragActive ? (
          <p className="dropzone-text">Release to add files...</p>
        ) : (
          <>
            <p className="dropzone-text">Drag & drop images here</p>
            <p className="dropzone-subtext">or click to browse</p>
            <div className="format-tags">
              <span>JPEG</span><span>PNG</span><span>HEIC</span>
            </div>
            <p className="dropzone-limit">Max 10MB per file · Multiple files supported</p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, isUploading }) {
  if (!isUploading && progress === 0) return null;
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="progress-label">{progress}%</span>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats }) {
  if (stats.total === 0) return null;
  return (
    <div className="stats-bar">
      <div className="stat-item stat-total">
        <span className="stat-value">{stats.total}</span>
        <span className="stat-label">Processed</span>
      </div>
      <div className="stat-sep" />
      <div className="stat-item stat-accepted">
        <span className="stat-value">{stats.accepted}</span>
        <span className="stat-label">Accepted</span>
      </div>
      <div className="stat-sep" />
      <div className="stat-item stat-rejected">
        <span className="stat-value">{stats.rejected}</span>
        <span className="stat-label">Rejected</span>
      </div>
      {stats.total > 0 && (
        <>
          <div className="stat-sep" />
          <div className="stat-item">
            <span className="stat-value">
              {Math.round((stats.accepted / stats.total) * 100)}%
            </span>
            <span className="stat-label">Pass Rate</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const {
    queue, accepted, rejected,
    isUploading, progress, error,
    addFiles, removeFromQueue, uploadQueue, clearAll, removeResult,
    stats,
  } = useImageUpload();

  const [activeTab, setActiveTab] = useState('all');

  const onDrop = useCallback(async (files) => {
    await addFiles(files);
  }, [addFiles]);

  const hasResults = accepted.length > 0 || rejected.length > 0;

  // Filter results based on active tab
  const displayAccepted = activeTab !== 'rejected' ? accepted : [];
  const displayRejected = activeTab !== 'accepted' ? rejected : [];

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
            </div>
            <span>ImageGuard</span>
          </div>
          <div className="header-tagline">Intelligent image validation pipeline</div>
        </div>
      </header>

      <main className="app-main">
        {/* Upload Section */}
        <section className="upload-section">
          <DropZone onDrop={onDrop} />

          {/* Queue */}
          {queue.length > 0 && (
            <div className="queue-section">
              <div className="section-header">
                <h3 className="section-title">Upload Queue <span className="badge">{queue.length}</span></h3>
                <button className="btn-ghost" onClick={() => queue.forEach(q => removeFromQueue(q.id))}>
                  Clear queue
                </button>
              </div>
              <div className="queue-list">
                {queue.map((item) => (
                  <QueueItem key={item.id} item={item} onRemove={removeFromQueue} />
                ))}
              </div>
              <div className="upload-actions">
                <ProgressBar progress={progress} isUploading={isUploading} />
                <button
                  className="btn-primary"
                  onClick={uploadQueue}
                  disabled={isUploading || queue.length === 0}
                >
                  {isUploading ? (
                    <><span className="spinner-sm" /> Validating...</>
                  ) : (
                    <>Upload & Validate {queue.length} file{queue.length !== 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="error-banner">
              <AlertIcon />
              <span>{error}</span>
              <button onClick={() => {}} className="error-close"><XIcon size={14} /></button>
            </div>
          )}
        </section>

        {/* Results Section */}
        {hasResults && (
          <section className="results-section">
            <div className="results-header">
              <StatsBar stats={stats} />

              <div className="results-controls">
                <div className="tab-group">
                  <button
                    className={`tab ${activeTab === 'all' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('all')}
                  >
                    All <span className="tab-count">{stats.total}</span>
                  </button>
                  <button
                    className={`tab ${activeTab === 'accepted' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('accepted')}
                  >
                    Accepted <span className="tab-count tab-count-green">{stats.accepted}</span>
                  </button>
                  <button
                    className={`tab ${activeTab === 'rejected' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('rejected')}
                  >
                    Rejected <span className="tab-count tab-count-red">{stats.rejected}</span>
                  </button>
                </div>

                <button className="btn-ghost btn-sm" onClick={clearAll}>
                  <TrashIcon /> Clear all
                </button>
              </div>
            </div>

            <div className="results-grid">
              {/* Accepted */}
              {displayAccepted.length > 0 && (
                <div className="results-column">
                  <div className="column-label column-label-accepted">
                    <CheckIcon />
                    Accepted ({displayAccepted.length})
                  </div>
                  <div className="cards-list">
                    {displayAccepted.map((img) => (
                      <ImageCard
                        key={img.id || img.localId}
                        image={img}
                        onRemove={removeResult}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Rejected */}
              {displayRejected.length > 0 && (
                <div className="results-column">
                  <div className="column-label column-label-rejected">
                    <XIcon />
                    Rejected ({displayRejected.length})
                  </div>
                  <div className="cards-list">
                    {displayRejected.map((img, i) => (
                      <ImageCard
                        key={img.id || img.localId || i}
                        image={img}
                        onRemove={removeResult}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Validation Rules Info */}
        {!hasResults && queue.length === 0 && (
          <section className="rules-section">
            <h3 className="rules-title">Validation Rules</h3>
            <div className="rules-grid">
              {[
                { icon: '📐', label: 'Minimum Resolution', desc: 'Images must be at least 200×200px' },
                { icon: '🗂️', label: 'Format Check', desc: 'Only JPEG, PNG, and HEIC formats accepted' },
                { icon: '🔍', label: 'Duplicate Detection', desc: 'Similar images are rejected using perceptual hashing' },
                { icon: '✨', label: 'Blur Detection', desc: 'Blurry images are rejected via Laplacian variance' },
                { icon: '👤', label: 'Face Size', desc: 'Faces must be large enough relative to the image' },
                { icon: '👥', label: 'Single Face Only', desc: 'Images with multiple faces are rejected' },
              ].map((rule) => (
                <div key={rule.label} className="rule-card">
                  <span className="rule-icon">{rule.icon}</span>
                  <div>
                    <p className="rule-label">{rule.label}</p>
                    <p className="rule-desc">{rule.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
