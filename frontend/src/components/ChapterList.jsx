import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function ChapterList({ chapters = [], selectedChapter, onSelectChapter, isLoading = false }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChapters = chapters.filter((chapter) =>
    chapter.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="chapter-panel">
      <Link to="/dashboard" className="back-link">
        Back to Dashboard
      </Link>
      <div className="chapter-header">
        <h2>
          Chapters
          {!isLoading && chapters.length > 0 && (
            <span className="chapter-count"> ({chapters.length})</span>
          )}
        </h2>
        <input
          type="text"
          className="chapter-search"
          placeholder="Search chapters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <div className="chapter-list">
        {isLoading ? (
          <div className="chapter-item" style={{ color: 'var(--text-secondary)', cursor: 'default', textAlign: 'center', padding: '20px' }}>
            Loading chapters...
          </div>
        ) : chapters.length === 0 ? (
          <div className="chapter-item" style={{ color: 'var(--text-secondary)', cursor: 'default', textAlign: 'center', padding: '20px' }}>
            No chapters found
          </div>
        ) : (
          <>
            {filteredChapters.map((chapter) => (
              <div
                key={chapter.id}
                className={`chapter-item ${selectedChapter?.id === chapter.id ? 'active' : ''}`}
                onClick={() => onSelectChapter(chapter)}
                title={`View ${chapter.name}`}
              >
                {chapter.name}
              </div>
            ))}
            {filteredChapters.length === 0 && searchQuery && (
              <div className="chapter-item" style={{ color: 'var(--text-secondary)', cursor: 'default' }}>
                No chapters matching "{searchQuery}"
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export default ChapterList;
