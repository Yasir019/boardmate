import React from 'react';

function Card({ title, description, color, onClick, className = '' }) {
  return (
    <div
      className={`card ${className}`}
      onClick={onClick}
      style={{ '--card-color': color }}
    >
      <h3 className="card-title">{title}</h3>
      {description && <p className="card-description">{description}</p>}
    </div>
  );
}

export default Card;
