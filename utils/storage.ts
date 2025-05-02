export const saveProject = (project) => {
	localStorage.setItem(`project_${project.id}`, JSON.stringify(project));
};

export const loadProject = (projectId) => {
	const project = localStorage.getItem(`project_${projectId}`);
	return project ? JSON.parse(project) : null;
};

export const saveGraphState = (projectId, graphState) => {
	localStorage.setItem(`graphState_${projectId}`, JSON.stringify(graphState));
};

export const loadGraphState = (projectId) => {
	const graphState = localStorage.getItem(`graphState_${projectId}`);
	return graphState ? JSON.parse(graphState) : null;
};
