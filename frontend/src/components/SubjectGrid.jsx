import React from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';

const subjects = [
  { id: 'Physics', name: 'Physics', icon: '⚛️', color: '#3b82f6' },
  { id: 'Chemistry', name: 'Chemistry', icon: '🧪', color: '#10b981' },
  { id: 'Biology', name: 'Biology', icon: '🧬', color: '#22c55e' },
  { id: 'Computer', name: 'Computer', icon: '💻', color: '#06b6d4' },
];

function SubjectGrid({ board, classLevel }) {
  const navigate = useNavigate();

  const handleSelectSubject = (subject) => {
    navigate(`/chat/${board.id}/${classLevel.id}/${subject.id}`);
  };

  return (
    <div>
      <div className="section-header">
        <h1>Select Your Subject</h1>
        <p>Choose a subject for {classLevel.name} - {board.name}</p>
      </div>
      <div className="card-grid">
        {subjects.map((subject) => (
          <Card
            key={subject.id}
            icon={subject.icon}
            title={subject.name}
            color={subject.color}
            onClick={() => handleSelectSubject(subject)}
            className="subject-card"
          />
        ))}
      </div>
    </div>
  );
}

export default SubjectGrid;
