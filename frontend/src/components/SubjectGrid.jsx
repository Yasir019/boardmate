import React from 'react';
import { useNavigate } from 'react-router-dom';

function SubjectGrid({ board, classLevel }) {
  const navigate = useNavigate();

  const handleSelectSubject = (subject) => {
    if (!subject.available) {
      return;
    }

    navigate(`/chat/${board.id}/${classLevel.id}/${subject.id}`);
  };

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <span className="section-kicker-badge">{classLevel.name}</span>
        <h1>Select Your Subject</h1>
        <p>Open a subject workspace with chapters, chat history, and studio tools ready for study.</p>
      </div>
      <div className="subject-card-grid">
        {classLevel.subjects.map((subject) => (
          <button
            key={subject.id}
            type="button"
            className={`subject-select-card${subject.available ? '' : ' coming-soon'}`}
            onClick={() => handleSelectSubject(subject)}
            disabled={!subject.available}
            aria-disabled={!subject.available}
          >
            <div className="selection-card-glow" aria-hidden="true"></div>
            <div className="subject-card-media-shell">
              <div className="subject-card-media">
                {subject.image ? (
                  <img src={subject.image} alt={`${subject.name} subject`} />
                ) : (
                  <div className="subject-card-placeholder" style={{ '--subject-color': subject.color }}>
                    {subject.shortLabel || subject.name.charAt(0)}
                  </div>
                )}
              </div>
            </div>

            <div className="subject-card-body">
              <div className="subject-card-name">{subject.name}</div>
              <div className="subject-card-status">{subject.status}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SubjectGrid;
