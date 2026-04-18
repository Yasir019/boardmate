import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import BoardGrid from '../components/BoardGrid';
import ClassGrid from '../components/ClassGrid';
import SubjectGrid from '../components/SubjectGrid';
import { boardCatalog } from '../data/catalog';

function Dashboard() {
  const [searchParams] = useSearchParams();
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    const boardId = searchParams.get('board');
    if (!boardId) {
      return;
    }

    const matchedBoard = boardCatalog.find(
      (board) => board.id.toLowerCase() === boardId.toLowerCase()
    );

    if (!matchedBoard) {
      return;
    }

    setSelectedBoard(matchedBoard);
    setSelectedClass(null);
  }, [searchParams]);

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

  const breadcrumbItems = [
    {
      label: 'Boards',
      onClick: selectedBoard ? handleBackToBoards : null,
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
      {selectedBoard && <Breadcrumbs items={breadcrumbItems} />}

      {selectedBoard && (
        <button
          type="button"
          className="back-button"
          onClick={selectedClass ? handleBackToClasses : handleBackToBoards}
        >
          Back
        </button>
      )}

      {!selectedBoard && <BoardGrid onSelectBoard={handleSelectBoard} />}

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
