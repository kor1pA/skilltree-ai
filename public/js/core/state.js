export const ROUTES = {
  '/': 'page-roadmap',
  '/roadmap': 'page-roadmap',
  '/mentors': 'page-mentors',
  '/mentor-cabinet': 'page-mentor-cabinet',
  '/b2b': 'page-b2b',
  '/profile': 'page-profile',
  '/auth': 'page-auth',
  '/login': 'page-auth',
};

export const ROUTE_TITLES = {
  '/': 'Моя карта розвитку — SkillTree AI',
  '/roadmap': 'Моя карта розвитку — SkillTree AI',
  '/mentors': 'Каталог менторів та сесій — SkillTree AI',
  '/mentor-cabinet': 'Кабінет ментора — SkillTree AI',
  '/b2b': 'B2B Skill Matrix — SkillTree AI',
  '/profile': 'Профіль та активні сесії — SkillTree AI',
  '/auth': 'Портал авторизації та доступу — SkillTree AI',
  '/login': 'Портал авторизації та доступу — SkillTree AI',
};

export const state = {
  data: null,
  currentRoute: '/roadmap',
  selectedTreeId: null,
  selectedNodeId: null,
  selectedTeamId: null,
  skillViewMode: '3d',
  authMode: 'login',
  registerRole: 'LEARNER',
  mentorSearch: '',
  mentorSpec: 'ALL',
  mentorSort: 'rating',
  globalSearch: '',
  bookingMentorId: null,
  paymentMethod: 'CARD',
};

export function getCurrentUser() {
  return state.data?.currentUser || null;
}

export function getActiveLearner() {
  const current = getCurrentUser();
  if (!current || current.role !== 'LEARNER') {
    return null;
  }
  const learners = state.data?.learners || [];
  return learners.find((l) => l.id === current.id) || current;
}

export function getActiveTree(learner) {
  if (!learner || !Array.isArray(learner.skillTrees) || learner.skillTrees.length === 0) {
    state.selectedTreeId = null;
    return null;
  }
  const found = learner.skillTrees.find((t) => t.id === state.selectedTreeId);
  if (found) return found;
  state.selectedTreeId = learner.skillTrees[0].id;
  return learner.skillTrees[0];
}

export function getActiveNode(tree) {
  if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) {
    state.selectedNodeId = null;
    return null;
  }
  const found = tree.nodes.find((n) => n.id === state.selectedNodeId);
  if (found) return found;
  const fallback = tree.nodes.find((n) => n.status === 'IN_PROGRESS') || tree.nodes[0];
  state.selectedNodeId = fallback.id;
  return fallback;
}
