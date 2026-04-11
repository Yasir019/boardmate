import React from 'react';

function ClassGrid({ board, onSelectClass }) {
  return (
    <div>
      <div className="section-header">
        <h1>Select Your Class</h1>
        <p>All class levels are visible for {board.name}. Available content is live, and the rest are marked coming soon.</p>
      </div>
      <div className="card-grid">
        {board.classes.map((cls) => (
          <button
            key={cls.id}
            type="button"
            className={`class-select-card ${cls.available ? 'is-live' : 'coming-soon'}`}
            onClick={() => cls.available && onSelectClass(cls)}
            disabled={!cls.available}
            aria-disabled={!cls.available}
          >
            <div className="class-card-title">{cls.name}</div>
            <div className="class-card-description">{cls.description}</div>
            <div className="class-card-status">{cls.status}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ClassGrid;
