import sindhLogo from '../assets/images/SIndh board.jpeg';
import punjabLogo from '../assets/images/Panjab board.jpeg';
import federalLogo from '../assets/images/Fedral board.png';
import kpkLogo from '../assets/images/KPK board.jpeg';
import balochistanLogo from '../assets/images/Balouchistan board.jpeg';
import physicsImage from '../assets/images/Pysicslogog.jpg';
import computerImage from '../assets/images/Computerlogo.jpg';
import biologyImage from '../assets/images/Biologylogo.jpeg';
import chemistryImage from '../assets/images/Chemistry.jpg';

const allClasses = [
  { id: '9th', name: '9th', description: 'Matriculation Part 1' },
  { id: '10th', name: '10th', description: 'Matriculation Part 2' },
  { id: '11th', name: '11th', description: 'Intermediate Part 1' },
  { id: '12th', name: '12th', description: 'Intermediate Part 2' },
];

const allSubjects = [
  { id: 'Computer', name: 'Computer', color: '#06b6d4', image: computerImage },
  { id: 'Physics', name: 'Physics', color: '#3b82f6', image: physicsImage },
  { id: 'Math', name: 'Math', color: '#8b5cf6', image: null, shortLabel: 'M' },
  { id: 'Biology', name: 'Biology', color: '#22c55e', image: biologyImage },
  { id: 'Chemistry', name: 'Chemistry', color: '#f97316', image: chemistryImage },
];

function buildSubjects(liveSubjectIds = []) {
  return allSubjects.map((subject) => ({
    ...subject,
    available: liveSubjectIds.includes(subject.id),
    status: liveSubjectIds.includes(subject.id) ? 'Available now' : 'Coming Soon',
  }));
}

function buildClasses(liveClassId, liveSubjectIds = []) {
  return allClasses.map((item) => ({
    ...item,
    available: item.id === liveClassId,
    status: item.id === liveClassId ? 'Available now' : 'Coming Soon',
    subjects: item.id === liveClassId ? buildSubjects(liveSubjectIds) : [],
  }));
}

export const boardCatalog = [
  {
    id: 'Panjab',
    name: 'Punjab',
    color: '#16a34a',
    logo: punjabLogo,
    available: true,
    status: 'Available now',
    classes: buildClasses('11th', ['Computer']),
  },
  {
    id: 'Sindh',
    name: 'Sindh',
    color: '#2563eb',
    logo: sindhLogo,
    available: true,
    status: 'Available now',
    classes: buildClasses('9th', ['Physics']),
  },
  {
    id: 'Federal',
    name: 'Federal',
    color: '#7c3aed',
    logo: federalLogo,
    available: false,
    status: 'Coming Soon',
    classes: [],
  },
  {
    id: 'KPK',
    name: 'KPK',
    color: '#d97706',
    logo: kpkLogo,
    available: false,
    status: 'Coming Soon',
    classes: [],
  },
  {
    id: 'Balochistan',
    name: 'Balochistan',
    color: '#dc2626',
    logo: balochistanLogo,
    available: false,
    status: 'Coming Soon',
    classes: [],
  },
];
