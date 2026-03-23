import React from 'react';
import sindhLogo from '../assets/images/SIndh board.jpeg';
import punjabLogo from '../assets/images/Panjab board.jpeg';
import federalLogo from '../assets/images/Fedral board.png';
import kpkLogo from '../assets/images/KPK board.jpeg';
import balochistanLogo from '../assets/images/Balouchistan board.jpeg';

const boards = [
  { id: 'Sindh', name: 'Sindh', color: '#3b82f6', logo: sindhLogo },
  { id: 'Panjab', name: 'Punjab', color: '#10b981', logo: punjabLogo },
  { id: 'Fedral', name: 'Federal', color: '#8b5cf6', logo: federalLogo },
  { id: 'KPK', name: 'KPK', color: '#f59e0b', logo: kpkLogo },
  { id: 'Balouchistan', name: 'Balochistan', color: '#ef4444', logo: balochistanLogo },
];

function BoardGrid({ onSelectBoard }) {
  return (
    <div>
      <div className="section-header">
        <h1>Select Your Board</h1>
        <p>Choose your educational board to get started</p>
      </div>
      <div className="board-card-grid">
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            className="board-select-card"
            onClick={() => onSelectBoard(board)}
          >
            <div className="board-card-media">
              <img src={board.logo} alt={`${board.name} board`} />
            </div>
            <div className="board-card-name">{board.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default BoardGrid;
