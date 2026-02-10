import React from 'react';
import Card from './Card';
import { classes } from '../data/mockData';

function ClassGrid({ board, onSelectClass }) {
  return (
    <div>
      <div className="section-header">
        <h1>Select Your Class</h1>
        <p>Choose your class level for {board.name}</p>
      </div>
      <div className="card-grid">
        {classes.map((cls) => (
          <Card
            key={cls.id}
            icon={cls.icon}
            title={cls.name}
            description={cls.description}
            color={board.color}
            onClick={() => onSelectClass(cls)}
            className="class-card"
          />
        ))}
      </div>
    </div>
  );
}

export default ClassGrid;
