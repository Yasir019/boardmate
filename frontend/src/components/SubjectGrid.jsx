import React from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import { subjects } from '../data/mockData';

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
