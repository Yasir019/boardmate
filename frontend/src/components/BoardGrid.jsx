import React from 'react';
import Card from './Card';
import { boards } from '../data/mockData';

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
