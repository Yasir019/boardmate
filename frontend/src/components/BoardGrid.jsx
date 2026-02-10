import React from 'react';
import Card from './Card';

const boards = [
  { id: 'Sindh', name: 'Sindh', icon: '🏛️', color: '#3b82f6' },
  { id: 'Punjab', name: 'Punjab', icon: '🏫', color: '#10b981' },
  { id: 'Federal', name: 'Federal', icon: '🎓', color: '#8b5cf6' },
  { id: 'KPK', name: 'KPK', icon: '📚', color: '#f59e0b' },
  { id: 'Balochistan', name: 'Balochistan', icon: '🏛️', color: '#ef4444' },
];

function BoardGrid({ onSelectBoard }) {
  return (
    <div>
      <div className="section-header">
        <h1>Select Your Board</h1>
        <p>Choose your educational board to get started</p>
      </div>
      <div className="card-grid">
        {boards.map((board) => (
          <Card
            key={board.id}
            icon={board.icon}
            title={board.name}
            color={board.color}
            onClick={() => onSelectBoard(board)}
          />
        ))}
      </div>
    </div>
  );
}

export default BoardGrid;
