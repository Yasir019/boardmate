import React from 'react';

function Card({ icon, title, description, color, onClick, className = '' }) {
  return (
    <div 
      className={`card ${className}`}
      onClick={onClick}
      style={{ '--card-color': color }}
    >
      <div className="card-icon">{icon}</div>
      <h3 className="card-title">{title}</h3>
      {description && <p className="card-description">{description}</p>}
    </div>
  );
}

export default Card;
