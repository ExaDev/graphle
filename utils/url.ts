export const encodeProject = (project) => {
	return encodeURIComponent(JSON.stringify(project));
};

export const decodeProject = (encodedProject) => {
	return JSON.parse(decodeURIComponent(encodedProject));
};

export const encodeView = (view) => {
	return encodeURIComponent(JSON.stringify(view));
};

export const decodeView = (encodedView) => {
	return JSON.parse(decodeURIComponent(encodedView));
};
