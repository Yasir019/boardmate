import React from 'react';
import Card from './Card';

const classes = [
  { id: '9th', name: '9th', icon: '9️⃣', description: 'Matriculation Part 1' },
  { id: '10th', name: '10th', icon: '🔟', description: 'Matriculation Part 2' },
  { id: '11th', name: '11th', icon: '1️⃣1️⃣', description: 'Intermediate Part 1' },
  { id: '12th', name: '12th', icon: '1️⃣2️⃣', description: 'Intermediate Part 2' },
];

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
