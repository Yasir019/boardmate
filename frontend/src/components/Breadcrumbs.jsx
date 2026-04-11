import React from 'react';

function Breadcrumbs({ items }) {
  return (
    <div className="breadcrumbs">
      {items.map((item, index) => (
        <div key={item.label} className="breadcrumb-item">
          {index > 0 && <span className="breadcrumb-separator">&gt;</span>}
          {item.onClick ? (
            <span className="breadcrumb-link" onClick={item.onClick}>
              {item.label}
            </span>
          ) : (
            <span className="breadcrumb-current">{item.label}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default Breadcrumbs;
