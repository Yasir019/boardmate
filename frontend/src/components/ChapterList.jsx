import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

function ChapterList({
  chapters = [],
  selectedChapter,
  onSelectChapter,
  isLoading = false,
  chatSessions = [],
  activeChatId = null,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onCollapsePanel,
}) {
  const [openMenuChatId, setOpenMenuChatId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const positionMenuFromButton = (buttonElement) => {
    if (!(buttonElement instanceof Element)) {
      return;
    }

    const rect = buttonElement.getBoundingClientRect();
    const menuWidth = 140;
    const menuHeight = 92;
    const spacing = 8;
    const nextLeft = Math.min(
      rect.right + spacing,
      window.innerWidth - menuWidth - spacing
    );
    const nextTop = Math.max(
      spacing,
      Math.min(rect.top - 8, window.innerHeight - menuHeight - spacing)
    );

    setMenuPosition({ top: nextTop, left: nextLeft });
  };

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenMenuChatId(null);
        return;
      }

      if (target.closest('.chat-history-more') || target.closest('.chat-history-menu')) {
        return;
      }
      setOpenMenuChatId(null);
    };

    const closeMenu = () => setOpenMenuChatId(null);

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);

  const formatSessionTime = (timestamp) => {
    if (!timestamp) {
      return '';
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <aside className="chapter-panel">
      <div className="back-link-row">
        <Link to="/dashboard" className="back-link">
          Back to Dashboard
        </Link>
        <button
          type="button"
          className="panel-collapse-btn"
          onClick={() => onCollapsePanel?.()}
          title="Hide chapters panel"
          aria-label="Hide chapters panel"
        >
          <span aria-hidden="true">&lsaquo;</span>
        </button>
      </div>
      <div className="chapter-header">
        <h2>
          Chapters
          {!isLoading && chapters.length > 0 && (
            <span className="chapter-count"> ({chapters.length})</span>
          )}
        </h2>
      </div>
      <div className="chapter-list">
        {isLoading ? (
          <div className="chapter-item" style={{ color: 'var(--text-secondary)', cursor: 'default', textAlign: 'center', padding: '20px' }}>
            Loading chapters...
          </div>
        ) : chapters.length === 0 ? (
          <div className="chapter-item" style={{ color: 'var(--text-secondary)', cursor: 'default', textAlign: 'center', padding: '20px' }}>
            No chapters found
          </div>
        ) : (
          <>
            {chapters.map((chapter) => (
              <div
                key={chapter.id}
                className={`chapter-item ${selectedChapter?.id === chapter.id ? 'active' : ''}`}
                onClick={() => onSelectChapter(chapter)}
                title={`View ${chapter.name}`}
              >
                {chapter.name}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="chat-history-panel">
        <div className="chat-history-header">
          <h3>Chat History</h3>
          <button
            type="button"
            className="new-chat-button"
            onClick={() => onNewChat?.()}
          >
            New Chat
          </button>
        </div>
        <div className="chat-history-list">
          {chatSessions.length === 0 ? (
            <div className="chat-history-empty">No chats yet for this chapter.</div>
          ) : (
            chatSessions.map((session) => (
              <div
                key={session.id}
                className={`chat-history-item ${activeChatId === session.id ? 'active' : ''}`}
                title={session.title}
              >
                <button
                  type="button"
                  className="chat-history-main"
                  onClick={() => onSelectChat?.(session.id)}
                >
                  <span className="chat-history-title">{session.title}</span>
                  <span className="chat-history-meta">{formatSessionTime(session.updated_at)}</span>
                </button>
                <div className="chat-history-actions">
                  <button
                    type="button"
                    className="chat-history-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (openMenuChatId === session.id) {
                        setOpenMenuChatId(null);
                        return;
                      }

                      positionMenuFromButton(event.currentTarget);
                      setOpenMenuChatId(session.id);
                    }}
                    title="Chat options"
                    aria-label="Chat options"
                    aria-haspopup="menu"
                    aria-expanded={openMenuChatId === session.id}
                  >
                    &#8942;
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {openMenuChatId && (() => {
        const activeSession = chatSessions.find((session) => session.id === openMenuChatId);
        if (!activeSession) {
          return null;
        }

        return createPortal(
          <div className="chat-history-menu-layer">
            <div
              className="chat-history-menu"
              role="menu"
              aria-label="Chat actions"
              style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
            >
              <button
                type="button"
                className="chat-history-menu-item"
                onClick={() => {
                  setOpenMenuChatId(null);
                  onRenameChat?.(activeSession.id, activeSession.title);
                }}
                role="menuitem"
              >
                Rename
              </button>
              <button
                type="button"
                className="chat-history-menu-item danger"
                onClick={() => {
                  setOpenMenuChatId(null);
                  onDeleteChat?.(activeSession.id);
                }}
                role="menuitem"
              >
                Delete
              </button>
            </div>
          </div>,
          document.body
        );
      })()}
    </aside>
  );
}

export default ChapterList;
