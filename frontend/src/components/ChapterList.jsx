import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function ChapterList({ chapters = [], selectedChapter, onSelectChapter, isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChapters = chapters.filter((chapter) =>
    chapter.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className={`chapter-panel ${isOpen ? 'open' : ''}`}>
      <Link to="/dashboard" className="back-link">
        ← Back to Dashboard
      </Link>
      <div className="chapter-header">
        <h2>Chapters</h2>
        <input
          type="text"
          className="chapter-search"
          placeholder="Search chapters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="chapter-list">
        {chapters.length === 0 ? (
          <div className="chapter-item coming-soon" style={{ color: 'var(--text-secondary)', cursor: 'default', textAlign: 'center', padding: '20px' }}>
            🚧 Coming Soon
          </div>
        ) : (
          <>
            {filteredChapters.map((chapter) => (
              <div
                key={chapter.id}
                className={`chapter-item ${selectedChapter?.id === chapter.id ? 'active' : ''}`}
                onClick={() => {
                  onSelectChapter(chapter);
                  if (onClose) onClose();
                }}
              >
                {chapter.name}
              </div>
            ))}
            {filteredChapters.length === 0 && searchQuery && (
              <div className="chapter-item" style={{ color: 'var(--text-secondary)', cursor: 'default' }}>
                No chapters found
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export default ChapterList;
