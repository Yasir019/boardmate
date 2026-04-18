import React from 'react';
import { boardCatalog } from '../data/catalog';

function BoardGrid({ onSelectBoard }) {
  return (
    <div className="dashboard-section">
      <div className="section-header">
        <h1>Select Your Board</h1>
      </div>
      <div className="board-card-grid">
        {boardCatalog.map((board) => (
          <button
            key={board.id}
            type="button"
            className={`board-select-card${board.available ? '' : ' coming-soon'}`}
            onClick={() => board.available && onSelectBoard(board)}
            disabled={!board.available}
            aria-disabled={!board.available}
          >
            <div className="board-card-media">
              <img src={board.logo} alt={`${board.name} board`} />
            </div>
            <div className="board-card-name">{board.name}</div>
            <div className="board-card-status">{board.status}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default BoardGrid;
