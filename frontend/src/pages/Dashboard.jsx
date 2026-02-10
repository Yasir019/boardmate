import React, { useState } from 'react';
import Breadcrumbs from '../components/Breadcrumbs';
import BoardGrid from '../components/BoardGrid';
import ClassGrid from '../components/ClassGrid';
import SubjectGrid from '../components/SubjectGrid';

function Dashboard() {
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);

  const handleSelectBoard = (board) => {
    setSelectedBoard(board);
    setSelectedClass(null);
  };

  const handleSelectClass = (cls) => {
    setSelectedClass(cls);
  };

  const handleBackToBoards = () => {
    setSelectedBoard(null);
    setSelectedClass(null);
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
  };

  // Build breadcrumb items
  const breadcrumbItems = [
    { 
      label: 'Boards', 
      onClick: selectedBoard ? handleBackToBoards : null 
    },
  ];

  if (selectedBoard) {
    breadcrumbItems.push({
      label: selectedBoard.name,
      onClick: selectedClass ? handleBackToClasses : null,
    });
  }

  if (selectedClass) {
    breadcrumbItems.push({
      label: selectedClass.name,
      onClick: null,
    });
  }

  return (
    <div className="dashboard">
      {/* Breadcrumbs */}
      {selectedBoard && <Breadcrumbs items={breadcrumbItems} />}

      {/* Back Button */}
      {selectedBoard && (
        <button 
          className="back-button"
          onClick={selectedClass ? handleBackToClasses : handleBackToBoards}
        >
          ← Back
        </button>
      )}

      {/* Content based on selection state */}
      {!selectedBoard && (
        <BoardGrid onSelectBoard={handleSelectBoard} />
      )}

      {selectedBoard && !selectedClass && (
        <ClassGrid 
          board={selectedBoard} 
          onSelectClass={handleSelectClass} 
        />
      )}

      {selectedBoard && selectedClass && (
        <SubjectGrid 
          board={selectedBoard} 
          classLevel={selectedClass} 
        />
      )}
    </div>
  );
}

export default Dashboard;
