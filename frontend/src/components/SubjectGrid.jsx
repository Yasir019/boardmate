import React from 'react';
import { useNavigate } from 'react-router-dom';
import chemistryImage from '../assets/images/Chemistry.jpg';
import physicsImage from '../assets/images/Pysicslogog.jpg';
import biologyImage from '../assets/images/Biologylogo.jpeg';
import computerImage from '../assets/images/Computerlogo.jpg';

const subjects = [
  { id: 'Physics', name: 'Physics', color: '#3b82f6', image: physicsImage },
  { id: 'Chemistry', name: 'Chemistry', color: '#10b981', image: chemistryImage },
  { id: 'Biology', name: 'Biology', color: '#22c55e', image: biologyImage },
  { id: 'Computer', name: 'Computer', color: '#06b6d4', image: computerImage },
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
      <div className="subject-card-grid">
        {subjects.map((subject) => (
          <button
            key={subject.id}
            type="button"
            className="subject-select-card"
            onClick={() => handleSelectSubject(subject)}
          >
            <div className="subject-card-media">
              <img src={subject.image} alt={`${subject.name} subject`} />
            </div>
            <div className="subject-card-name">{subject.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SubjectGrid;
