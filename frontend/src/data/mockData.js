// Mock data for BoardMate

export const boards = [
  { id: 'sindh', name: 'Sindh Board', icon: '🏛️', color: '#3b82f6' },
  { id: 'punjab', name: 'Punjab Board', icon: '🏫', color: '#10b981' },
  { id: 'federal', name: 'Federal Board', icon: '🎓', color: '#8b5cf6' },
  { id: 'kpk', name: 'KPK Board', icon: '📚', color: '#f59e0b' },
  { id: 'balochistan', name: 'Balochistan Board', icon: '🏛️', color: '#ef4444' },
];

export const classes = [
  { id: '9', name: '9th Class', icon: '9️⃣', description: 'Matriculation Part 1' },
  { id: '10', name: '10th Class', icon: '🔟', description: 'Matriculation Part 2' },
  { id: '11', name: '11th Class', icon: '1️⃣1️⃣', description: 'Intermediate Part 1' },
  { id: '12', name: '12th Class', icon: '1️⃣2️⃣', description: 'Intermediate Part 2' },
];

export const subjects = [
  { id: 'physics', name: 'Physics', icon: '⚛️', color: '#3b82f6' },
  { id: 'chemistry', name: 'Chemistry', icon: '🧪', color: '#10b981' },
  { id: 'biology', name: 'Biology', icon: '🧬', color: '#22c55e' },
  { id: 'mathematics', name: 'Mathematics', icon: '📐', color: '#f59e0b' },
  { id: 'english', name: 'English', icon: '📖', color: '#8b5cf6' },
  { id: 'urdu', name: 'Urdu', icon: '📝', color: '#ec4899' },
  { id: 'computer-science', name: 'Computer Science', icon: '💻', color: '#06b6d4' },
];

export const chapters = [
  { id: 1, name: 'Chapter 1: Introduction' },
  { id: 2, name: 'Chapter 2: Fundamentals' },
  { id: 3, name: 'Chapter 3: Core Concepts' },
  { id: 4, name: 'Chapter 4: Applications' },
  { id: 5, name: 'Chapter 5: Advanced Topics' },
  { id: 6, name: 'Chapter 6: Problem Solving' },
  { id: 7, name: 'Chapter 7: Case Studies' },
  { id: 8, name: 'Chapter 8: Review & Summary' },
];

export const mockMessages = [
  {
    id: 1,
    type: 'bot',
    text: 'Hello! I\'m BoardMate, your study assistant. How can I help you today?',
    timestamp: new Date().toISOString(),
  },
  {
    id: 2,
    type: 'user',
    text: 'Can you explain Newton\'s First Law of Motion?',
    timestamp: new Date().toISOString(),
  },
  {
    id: 3,
    type: 'bot',
    text: 'Newton\'s First Law of Motion, also known as the Law of Inertia, states that an object at rest will stay at rest, and an object in motion will stay in motion with the same speed and direction, unless acted upon by an external force.\n\nIn simpler terms:\n• A stationary book on your desk won\'t move by itself\n• A rolling ball will keep rolling until friction or another force stops it\n\nWould you like me to explain this with more examples?',
    timestamp: new Date().toISOString(),
  },
];

// Helper function to get board by ID
export const getBoardById = (id) => boards.find(b => b.id === id);

// Helper function to get class by ID
export const getClassById = (id) => classes.find(c => c.id === id);

// Helper function to get subject by ID
export const getSubjectById = (id) => subjects.find(s => s.id === id);
